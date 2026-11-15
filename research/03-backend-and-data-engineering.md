# SPHEREx Viewer Research, Document 3
## Backend Architecture and Data Engineering

I treated the backend as a proxy and a cache, not as a data center. That decision came from the data: the archive already has the pixels, the catalogues already have the sources, and the browser can parse a FITS cutout without a Python service. The backend’s job is to make those requests safe, bounded, and repeatable.

This document covers the architecture I chose, the alternatives I evaluated, and the parts of the original “starter stack” that I did not use.

## The shape of the system

The app is a React/TypeScript client served by a Cloudflare Worker. The Worker uses Hono for routing. Vite builds the client and the Worker together through the Cloudflare Vite plugin. Wrangler deploys the Worker and its static assets.

There is no FastAPI service, no dask cluster, no PostgreSQL database, and no object-store mirror. That is not because those tools are bad. It is because the first version has no user accounts, no long-running jobs, and no need to store derived data. A request comes in, the Worker validates it, fetches from IRSA or Gaia, optionally caches the response, and returns it. The browser does the FITS parsing and drawing.

The trade-off is that the Worker is not the place for heavy computation. It has a CPU budget, a memory budget, and a subrequest budget. Reprojection, coaddition, difference imaging, and cube building belong in a batch system, not in a request handler. I kept them out.

## The API surface

The API is small on purpose.

| Route | Purpose | Main parameters |
|---|---|---|
| `GET /api/spherex/find` | SIA2 discovery | `ra`, `dec`, `fov` |
| `GET /api/spherex/cutout` | Real FITS cutout | `uri`, `ra`, `dec`, `fov` |
| `GET /api/spherex/spectrum` | Aperture spectrum | `uri` (up to six), `ra`, `dec` |
| `GET /api/catalog` | Gaia or AllWISE cone search | `survey`, `ra`, `dec`, `radius` |
| `GET /api/health` | Liveness | none |

All routes return JSON errors with `{ error, code, requestId }` and `Cache-Control: no-store` on failures. Successful cutouts return `application/fits`; successful catalog and discovery responses return JSON.

The `find` route is the one that matters most. It builds an IRSA SIA2 query with `COLLECTION=spherex_dr1`, `POS=circle RA Dec radius`, `RESPONSEFORMAT=CSV`, and `MAXREC=300`. It parses the CSV, groups rows by observation time and `obs_id`, extracts the detector from the filename, and returns a list of observations with their detector products.

The `cutout` route does not accept an arbitrary URL. It accepts an IRSA product URL that passes an allowlist: HTTPS, `irsa.ipac.caltech.edu`, path under `/ibe/data/spherex/`, `.fits` suffix, no userinfo, no port, no fragment, no path traversal. It then appends `center=RA,Dec`, `size=...d`, and `gzip=false`, fetches the cutout, checks that it starts with `SIMPLE`, and strips the `EPSF` HDU before returning it. The strip is important: the PSF table is large and the viewer does not need it for the basic image. The local FITS lab can read a full PSF product if the user supplies one.

The `spectrum` route is the same cutout service with a `24,2040pix` strip. It reads `IMAGE`, `VARIANCE`, `FLAGS`, and `WCS-WAVE`, averages a five-pixel aperture row by row, and returns the real samples. It fetches at most six detector strips, three at a time, and reports partial failures instead of failing the whole request.

The `catalog` route uses Gaia TAP for Gaia and IRSA Gator for AllWISE. Both are live queries with a row cap. The app does not keep a local copy of either catalog.

## Why not FastAPI + dask?

The original research stack suggested FastAPI, dask, `kerchunk`, `xarray`, and a PostgreSQL/PostGIS database. Those are reasonable choices for a team building a data service. They are not the smallest correct choice for this app.

- **FastAPI** would add a Python runtime and a container. The Worker already runs at the edge, close to the user, and the request is a simple proxy. The CPU work is FITS parsing, which happens in the browser.
- **dask** would help with a multi-epoch coadd or a large cutout batch. The current app fetches one cutout at a time. Adding dask would be infrastructure without a workload.
- **kerchunk/xarray** would be useful for reading many S3 objects as virtual datasets. The app does not need a virtual dataset; it needs one cutout from IRSA.
- **PostgreSQL/PostGIS** would be useful for jobs, annotations, and a local catalogue. The app has none of those. The URL is the state.

The edge proxy has real limits, and I designed around them. Cloudflare Workers have a CPU budget, a 128 MB memory limit, a subrequest limit, and a 64 MiB Worker bundle limit. The Cache API is per-data-center, not a global database. The app uses the Cache API for successful GETs and a small in-memory TTL cache for hot requests, but it does not treat either one as durable storage.

If the app grows a job queue, the calculation changes. A video render or a multi-epoch stack should be a queued job with an object-store result, not a long request. That is the point where a database and a worker pool start to earn their keep.

## Caching

There are four cache layers, and they do different things.

1. **In-memory TTL caches** inside the Worker isolate. SIA2 results live for 5 minutes, catalogue results for 30 minutes, and spectrum segments for 10 minutes. These are bounded maps, not a database.
2. **Single-flight** wrappers. If ten users request the same field at once, one upstream request runs and the rest wait for it. This protects IRSA from a thundering herd and keeps latency predictable.
3. **The Cloudflare Cache API**, under the `drift-api-v2` namespace. Successful GET responses are stored with the route’s cache headers. Discovery is cached for 5 minutes, cutouts for a day at the browser and a week at the edge, catalogues for 30 minutes, and spectra for 5 minutes.
4. **The bundled default field**. The client ships a real SIA2 result (`dr1-150.json`) and a real D2 cutout (`dr1-d2-150.fits`). The server also has an exact-coordinate fallback to the bundled SIA result. This is the only offline pixel path.

The caches are deliberately conservative. A cutout is immutable for a given product and center, so a long TTL is safe. A SIA2 result can change when new data are ingested, so 5 minutes is a reasonable compromise. A catalogue can change when a new data release lands, so 30 minutes is a compromise between freshness and load.

The failure path is not a cache. If SIA2 returns a 5xx, the Worker maps it to a 502 and puts the service into a 30-second cooldown. During the cooldown, requests return 503 with `Retry-After` instead of hammering the archive. The default field can still fall back to the bundled result; other fields cannot.

That behavior matters for the current IRSA outage. SIA2 and TAP have been returning 502s, while the cutout service and S3 are healthy. The app’s default field still works from the bundled index and cutout. The other presets fail at discovery because there is no cached index for them. That is a deliberate consequence of caching only the default, not a bug in the cutout path.

## Security and robustness

The most important security property is the SSRF boundary. The cutout and spectrum routes accept a URL from the client, so the Worker must not fetch arbitrary hosts. The allowlist checks the protocol, host, path prefix, suffix, userinfo, port, fragment, and traversal. It also rejects anything that is not an IRSA SPHEREx FITS product.

The rest is input discipline:

- RA is 0–360, Dec is −90 to +90, FOV is 0.02–0.9 for cutouts and 0.1–0.9 for discovery.
- `survey` is an enum (`gaia` or `wise`).
- Spectrum requests are capped at six detector products.
- A cutout response is capped at 40 MB; a SIA response at 1.5 MB; a catalogue response at 2 MB.
- Upstream requests have per-attempt timeouts and a total budget: 50 s for SIA2, 45 s for cutouts and TAP.
- Transient 408/429/5xx responses retry with exponential backoff and honor `Retry-After`.
- Every API response carries a request ID, and server errors log a bounded JSON record.

None of this makes the Worker a general-purpose proxy. It makes it a narrow, auditable bridge to two archives.

## Storage and the database question

I evaluated the public S3 bucket seriously. It is excellent for bulk access, and it is the right place to build a global index if the app ever needs one. But S3 is not a spatial discovery service. There is no native “find all objects covering this cone” query. A global index would need a separate database or a precomputed spatial index, plus a refresh pipeline for weekly ingest.

IRSA’s SIA2 service already solves that problem, and its cutout service already solves the “give me only the pixels around this position” problem. Using S3 would have meant rebuilding both. I kept S3 as a documented fallback and a future source for a cached preset index, not as the live path.

I did not add PostgreSQL/PostGIS. The app has no user accounts, no annotations, no job history, and no local catalogue. The shareable URL is the state. If I add named workspaces, saved sessions, or asynchronous jobs, a small Postgres instance with PostGIS becomes reasonable. It would store job metadata and annotations, not the pixels.

## Async jobs and video

The research plan included a job API for video generation: `POST /jobs`, `GET /jobs/{id}/status`, `GET /jobs/{id}/result`. I did not build it. The current viewer changes visits interactively; it does not render an MP4. A video job would need a queue, a worker, an object store, and a cleanup policy. That is a different product.

If I build it, the design is straightforward:

- The API creates a job row with the field, visits, bands, stretch, and output format.
- A queue consumer fetches the cutouts, reprojects or aligns them, renders frames, and writes the result to R2 or S3.
- The status route reports progress and errors.
- The result route returns a signed URL with an expiry.
- The job row is the source of truth; the object store holds the bytes.

That is the point where a database is not optional. The current app does not need it.

## Deployment and operations

The build is `vite build` plus a postbuild step that packages the Worker. Wrangler points at `src/worker/index.ts` and serves static assets through the `ASSETS` binding. The Worker handles `/api/*` first, then falls through to the asset handler for the SPA.

The health route is intentionally cheap: it returns `{ ok: true, service: 'drift', source: 'IRSA SPHEREx DR1', time }` and does not call upstream. That makes it a liveness check, not a dependency check. A separate canary should probe SIA2 and the cutout service if I want to distinguish “the app is up” from “IRSA is up.”

The logs are structured JSON for API errors and asset errors. They include the request ID, path, status, code, and a truncated detail. They do not log the full upstream body or any user data. There is no user data to log.

## The starter stack, item by item

The research plan ended with a recommended stack. I did not adopt it wholesale, so it is worth recording what happened to each piece.

**kerchunk + xarray + fsspec.** These are the right tools for reading many FITS headers and bytes from S3 without downloading whole files, and for presenting a virtual Zarr dataset. I did not need a virtual dataset. The app requests one cutout from IRSA and parses it in the browser. If I build a global S3 index or a multi-epoch cube, `kerchunk` becomes useful. It is not useful for a single 176 × 176 cutout.

**dask.** Dask is the right answer for parallel cutouts, reprojection, and coaddition across epochs and bands. The current app has no batch workload. Adding dask would mean running a Python service and a scheduler for a request that already completes in a few seconds at the edge. I left it out.

**reproject.** This is the gold standard for FITS WCS alignment, and I would use it for a coadd. The current viewer deliberately preserves the native detector WCS instead of resampling. That is a scientific choice: it keeps the pixel values and the geometry exactly as IRSA produced them.

**photutils + scikit-image.** These are the tools I would use for PSF photometry, source detection, and artifact masking in a difference-imaging pipeline. The current app does not detect sources or subtract images. It draws the real pixels and measures a simple aperture spectrum. Adding photutils to the Worker would be the wrong runtime; adding it to a batch job is the right move.

**FastAPI.** A good choice for a Python API with async jobs and OpenAPI docs. I used Hono on Cloudflare Workers because the app is a thin proxy and the FITS work happens in the browser. If the app grows a job queue, FastAPI or a Worker-based queue consumer are both reasonable; the decision should follow the workload, not the other way around.

**React + TypeScript + Aladin Lite.** I used React and TypeScript. I did not embed Aladin Lite. Aladin is excellent for HiPS surveys and catalogue overlays, but the core view here is a native detector frame with a `WCS-WAVE` table. The custom canvas does that job with less abstraction. I kept an Aladin link for cross-checking the field against a standard survey.

**uPlot or Plotly.** Both are good charting libraries. The spectrum is a single SVG with a handful of segments and a log x-axis. A charting dependency would add bundle weight and a second rendering model for a plot that is already simple. I drew it directly.

**PostgreSQL + PostGIS.** I did not use it. There are no jobs, annotations, or local catalogue to store. The URL is the state. If I add saved sessions or asynchronous renders, a small Postgres instance with PostGIS is the natural place to put the job metadata. It would not store the pixels.

**A local Gaia/WISE catalogue.** I query Gaia TAP and IRSA Gator live. A local copy with `q3c` or `pgSphere` would make cone searches faster and remove a network dependency, but it would also add hundreds of gigabytes and a refresh pipeline. At this scale, live queries are the better trade.

**Tile cache (XYZ/WMTS).** I did not build one. A tile cache assumes a pre-generated, north-up, deep coadd. The app shows native detector cutouts, not map tiles. A tile layer would hide the very geometry the viewer is trying to expose. If I add an all-sky context map, it should be a separate HiPS layer, clearly labeled as context rather than the science frame.

## What I would change at scale

If this became a public service with thousands of users, I would add:

- A durable cutout cache keyed by product URI, center, and size, with a size budget and an eviction policy.
- A preset index for the most-used fields, so an IRSA discovery outage does not break the landing experience.
- A queue for coadds, difference images, and video, with a Postgres job table.
- A canary that distinguishes SIA2, TAP, cutout, and S3 health.
- A real integration test that runs against a recorded FITS fixture and a mock SIA response.

I would not move the FITS parsing to the server. The browser already has the bytes, and the parser is the part that makes the viewer feel immediate. The server should stay a proxy.

## Sources

- Hono routing: https://hono.dev/docs/api/routing
- Cloudflare Workers Cache API: https://developers.cloudflare.com/workers/runtime-apis/cache
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits
- Cloudflare Workers cache behavior: https://developers.cloudflare.com/workers/reference/how-the-cache-works/
- IRSA SIA2 documentation: https://irsa.ipac.caltech.edu/ibe/sia.html
- IRSA TAP documentation: https://irsa.ipac.caltech.edu/docs/program_interface/TAP.html
- IRSA SPHEREx cutout tool: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html
- IRSA Cloud Access: https://irsa.ipac.caltech.edu/cloud_access/
- SPHEREx Data Access: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access
- Gaia Archive programmatic access: https://www.cosmos.esa.int/web/gaia-users/archive/programmatic-access
