from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "clean"
OUT.mkdir(exist_ok=True)

API_TABLE_OLD = """| Route | Purpose | Main parameters |
|---|---|---|
| `GET /api/spherex/find` | SIA2 discovery | `ra`, `dec`, `fov` |
| `GET /api/spherex/cutout` | Real FITS cutout | `uri`, `ra`, `dec`, `fov` |
| `GET /api/spherex/spectrum` | Aperture spectrum | `uri` (up to six), `ra`, `dec` |
| `GET /api/catalog` | Gaia or AllWISE cone search | `survey`, `ra`, `dec`, `radius` |
| `GET /api/health` | Liveness | none |"""

API_TABLE_NEW = """Discovery: GET /api/spherex/find, with ra, dec and fov.
Cutout: GET /api/spherex/cutout, with uri, ra, dec and fov.
Spectrum: GET /api/spherex/spectrum, with up to six uri values, ra and dec.
Catalog: GET /api/catalog, with survey, ra, dec and radius.
Health: GET /api/health, with no parameters."""

VALIDATION_TABLE_OLD = """| Target | Why it matters | What the tool can and cannot show |
|---|---|---|
| Barnard’s Star | High proper motion, about 10.3 arcsec yr⁻¹; roughly 20 arcsec over two years | The visit series can show the field at different epochs. The current viewer does not shift-and-stack or measure a PM. |
| WISE 0855 | Very faint Y dwarf, fast mover; a stacking and sensitivity test | Single-epoch detection is not guaranteed. The tool can show the real cutout and flags; it does not claim a detection. |
| Epsilon Indi B | Brown-dwarf pair separated by roughly 0.7–1.5 arcsec | The pair is unresolved at 6.15 arcsec pixels. The tool can show a blended PSF and variability, not a resolved binary. |
| RW Aur / R Dra | Variables with timescales that can alias a six-month cadence | The visit scrubber shows the sampling. It cannot recover a period the cadence does not support. |"""

VALIDATION_TABLE_NEW = """Barnard's Star has a proper motion of about 10.3 arcsec per year (Barnard 1916). Over a two-year baseline that is roughly 20 arcsec, or about three SPHEREx pixels. The visit series can show the field at different epochs, but the current viewer does not shift-and-stack or measure a proper motion.

WISE 0855 is a very faint Y dwarf with a large proper motion (Luhman 2014). It is a stacking and sensitivity test, not a single-epoch detection guarantee. The tool can show the real cutout and flags; it does not claim a detection.

Epsilon Indi B is a brown-dwarf pair separated by roughly 0.7-1.5 arcsec. The pair is unresolved at 6.15 arcsec pixels. The tool can show a blended PSF and variability, not a resolved binary.

RW Aur and R Dra are variables with timescales that can alias a six-month cadence. The visit scrubber shows the sampling. It cannot recover a period the cadence does not support."""

REFS = {
    "akeson2026a": "Akeson, R., Dubois-Felsmann, G. P., Crill, B. P., et al. 2026a. The SPHEREx Image and Spectrophotometry Processing Pipeline. ApJS, 285, 67. doi:10.3847/1538-4365/ae8843.",
    "akeson2026b": "Akeson, R., Faisst, A., Masters, D., et al. 2026b. SPHEREx Explanatory Supplement. SSDC-DP-017, version 2.1. Caltech/IPAC. https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp.pdf",
    "bock2026": "Bock, J. J., Aboobaker, A. M., Adamo, J., et al. 2026. The SPHEREx Satellite Mission. ApJ, 999, 139. doi:10.3847/1538-4357/ae2be2.",
    "crill2020": "Crill, B. P., Werner, M., Akeson, R., et al. 2020. SPHEREx: NASA's near-infrared spectrophotometric all-sky survey. Proc. SPIE, 11443, 114430I. doi:10.1117/12.2567224.",
    "crill2025": "Crill, B. P., Bach, Y. P., Bryan, S. A., et al. 2025. The SPHEREx Sky Simulator: Science Data Modeling for the First All-sky Near-infrared Spectral Survey. ApJS, 281, 10. doi:10.3847/1538-4365/ae04cc.",
    "alard1998": "Alard, C., & Lupton, R. H. 1998. A Method for Optimal Image Subtraction. ApJ, 503, 325-331. doi:10.1086/305984.",
    "bramich2008": "Bramich, D. M. 2008. A new algorithm for difference image analysis. MNRAS, 386, L77-L81. doi:10.1111/j.1745-3933.2008.00464.x.",
    "zackay2016": "Zackay, B., Ofek, E. O., & Gal-Yam, A. 2016. Proper Image Subtraction: Optimal Transient Detection, Photometry, and Hypothesis Testing. ApJ, 830, 27. doi:10.3847/0004-637X/830/1/27.",
    "anderson2000": "Anderson, J., & King, I. R. 2000. Toward High-Precision Astrometry with WFPC2. I. Deriving an Accurate Point-Spread Function. PASP, 112, 1360-1382. doi:10.1086/316632.",
    "bertin1996": "Bertin, E., & Arnouts, S. 1996. SExtractor: Software for source extraction. A&AS, 117, 393-404. doi:10.1051/aas:1996164.",
    "calabretta2002": "Calabretta, M. R., & Greisen, E. W. 2002. Representations of celestial coordinates in FITS. A&A, 395, 1077-1122. doi:10.1051/0004-6361:20021327.",
    "greisen2002": "Greisen, E. W., & Calabretta, M. R. 2002. Representations of world coordinates in FITS. A&A, 395, 1061-1075.",
    "greisen2006": "Greisen, E. W., Calabretta, M. R., Valdes, F. G., & Allen, S. L. 2006. Representations of spectral coordinates in FITS. A&A, 446, 747-771. doi:10.1051/0004-6361:20053818.",
    "hanisch2001": "Hanisch, R. J., Farris, A., Greisen, E. W., et al. 2001. Definition of the Flexible Image Transport System (FITS). A&A, 376, 359-380. doi:10.1051/0004-6361:20010923.",
    "gorski2005": "Gorski, K. M., Hivon, E., Banday, A. J., et al. 2005. HEALPix: A Framework for High-Resolution Discretization and Fast Analysis of Data Distributed on the Sphere. ApJ, 622, 759-771. doi:10.1086/427976.",
    "jacob2010": "Jacob, J. C., Katz, D. S., Berriman, G. B., et al. 2010. Montage: a grid portal and software toolkit for science-grade astronomical image mosaicking. International Journal of Computational Science and Engineering, 4, 73-87.",
    "robitaille2020": "Robitaille, T., Deil, C., & Ginsburg, A. 2020. reproject: Python-based astronomical image reprojection. Astrophysics Source Code Library, ascl:2011.023.",
    "astropy2022": "Astropy Collaboration, Price-Whelan, A. M., Lim, P. L., et al. 2022. The Astropy Project: Sustaining and Growing a Community-oriented Open-source Project and the Latest Major Release (v5.0) of the Core Package. ApJ, 935, 167. doi:10.3847/1538-4357/ac7c74.",
    "gaia2023": "Gaia Collaboration, Vallenari, A., Brown, A. G. A., et al. 2023. Gaia Data Release 3. Summary of the content and survey properties. A&A, 674, A1. doi:10.1051/0004-6361/202243940.",
    "cutri2013": "Cutri, R. M., Wright, E. L., Conrow, T., et al. 2013. Explanatory Supplement to the AllWISE Data Release Products. IPAC/Caltech.",
    "wright2010": "Wright, E. L., Eisenhardt, P. R. M., Mainzer, A. K., et al. 2010. The Wide-field Infrared Survey Explorer (WISE): Mission Description and Initial On-orbit Performance. AJ, 140, 1868-1881. doi:10.1088/0004-6256/140/6/1868.",
    "kelsall1998": "Kelsall, T., Weiland, J. L., Franz, B. A., et al. 1998. The COBE Diffuse Infrared Background Experiment Search for the Cosmic Infrared Background. II. Model of the Interplanetary Dust Cloud. ApJ, 508, 44-73. doi:10.1086/306380.",
    "wilkinson2016": "Wilkinson, M. D., Dumontier, M., Aalbersberg, I. J., et al. 2016. The FAIR Guiding Principles for scientific data management and stewardship. Scientific Data, 3, 160018. doi:10.1038/sdata.2016.18.",
    "lang2010": "Lang, D., Hogg, D. W., Mierle, K., Blanton, M., & Roweis, S. 2010. Astrometry.net: Blind Astrometric Calibration of Arbitrary Astronomical Images. AJ, 139, 1782-1800. doi:10.1088/0004-6256/139/5/1782.",
    "barnard1916": "Barnard, E. E. 1916. A small star with large proper motion. AJ, 29, 181-183. doi:10.1086/104156.",
    "luhman2014": "Luhman, K. L. 2014. Discovery of a ~250 K Brown Dwarf at 2 pc from the Sun. ApJL, 786, L18. doi:10.1088/2041-8205/786/2/L18.",
}

DOC_REFS = {
    "01": ["crill2020", "bock2026", "akeson2026a", "akeson2026b", "crill2025", "hanisch2001", "greisen2002", "calabretta2002", "greisen2006", "anderson2000", "gaia2023", "kelsall1998", "wilkinson2016"],
    "02": ["akeson2026a", "akeson2026b", "bock2026", "crill2020", "alard1998", "bramich2008", "zackay2016", "jacob2010", "robitaille2020", "astropy2022", "kelsall1998", "gaia2023", "cutri2013", "wright2010", "barnard1916", "luhman2014", "lang2010", "bertin1996"],
    "03": ["akeson2026a", "akeson2026b", "bock2026", "hanisch2001", "calabretta2002", "greisen2006", "jacob2010", "robitaille2020", "astropy2022", "gorski2005", "wilkinson2016", "gaia2023", "cutri2013"],
    "04": ["akeson2026a", "akeson2026b", "bock2026", "crill2020", "crill2025", "hanisch2001", "calabretta2002", "greisen2006", "lang2010", "astropy2022", "anderson2000", "barnard1916", "luhman2014", "kelsall1998"],
}

URLS = {
    "01": [
        "SPHEREx instrument: https://spherex.caltech.edu/page/instrument",
        "SPHEREx survey: https://spherex.caltech.edu/page/survey",
        "SPHEREx DR1: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html",
        "IRSA SPHEREx: https://irsa.ipac.caltech.edu/Missions/spherex.html",
        "SPHEREx data products: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products",
        "IRSA cloud access: https://irsa.ipac.caltech.edu/cloud_access/",
    ],
    "02": [
        "SPHEREx data products: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products",
        "Astropy reproject: https://docs.astropy.org/projects/reproject/en/stable/",
        "Montage: http://montage.ipac.caltech.edu/",
        "Gaia Archive: https://gea.esac.esa.int/archive/",
        "IRSA Gator: https://irsa.ipac.caltech.edu/docs/howto/gator_prog_interface.html",
        "Sesame: https://cds.unistra.fr/cgi-bin/Sesame",
    ],
    "03": [
        "IRSA SIA2: https://irsa.ipac.caltech.edu/ibe/sia.html",
        "IRSA TAP: https://irsa.ipac.caltech.edu/docs/program_interface/TAP.html",
        "SPHEREx cutout tool: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html",
        "IRSA cloud access: https://irsa.ipac.caltech.edu/cloud_access/",
        "Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits",
        "Cloudflare Cache API: https://developers.cloudflare.com/workers/runtime-apis/cache",
    ],
    "04": [
        "SPHEREx data products: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products",
        "SPHEREx DR1: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html",
        "IRSA SPHEREx: https://irsa.ipac.caltech.edu/Missions/spherex.html",
        "IRSA data use terms: https://irsa.ipac.caltech.edu/data_use_terms.html",
        "Aladin Lite: https://aladin.cds.unistra.fr/AladinLite/doc",
    ],
}

CITES = {
    "01": [
        ("The companion documents cover the science algorithms, the backend, and the front end.",
         "The companion documents cover the science algorithms, the backend, and the front end. The factual spine here comes from the SPHEREx mission papers (Crill et al. 2020; Bock et al. 2026), the pipeline paper (Akeson et al. 2026a), and the Explanatory Supplement (Akeson et al. 2026b). The coordinate and spectral conventions follow the FITS WCS papers (Greisen & Calabretta 2002; Calabretta & Greisen 2002; Greisen et al. 2006)."),
        ("IRSA is the public data access point.", "IRSA is the public data access point (Akeson et al. 2026b)."),
        ("The data are public.", "The data are public, and the FAIR principles are a useful way to describe the access model (Wilkinson et al. 2016)."),
        ("Data release status also matters.", "Data release status also matters (Akeson et al. 2026a, 2026b)."),
        ("A SPHEREx Level-2 product is a Multi-Extension FITS file for one detector and one pointing.",
         "A SPHEREx Level-2 product is a Multi-Extension FITS file for one detector and one pointing (Akeson et al. 2026a, 2026b)."),
        ("The active detector is 2,040 x 2,040 pixels", "The active detector is 2,040 x 2,040 pixels (Bock et al. 2026)"),
        ("There are six Teledyne H2RG HgCdTe detector arrays", "There are six Teledyne H2RG HgCdTe detector arrays (Crill et al. 2020; Bock et al. 2026)"),
        ("The exact resolving powers are quoted slightly differently", "The exact resolving powers are quoted slightly differently (Bock et al. 2026; Akeson et al. 2026a)"),
        ("The SPHEREx PSF is significantly undersampled", "The SPHEREx PSF is significantly undersampled (Akeson et al. 2026a; Anderson & King 2000)"),
        ("The sky simulator paper describes the variation", "The sky simulator paper describes the variation (Crill et al. 2025)"),
        ("The names and bit assignments are in Table 10 of the Explanatory Supplement.", "The names and bit assignments are in Table 10 of the Explanatory Supplement (Akeson et al. 2026b)."),
        ("The WCS is a tangent-plane projection with SIP distortion.", "The WCS is a tangent-plane projection with SIP distortion (Calabretta & Greisen 2002; Greisen & Calabretta 2002)."),
        ("The fine-astrometry step uses Gaia DR3 as the reference", "The fine-astrometry step uses Gaia DR3 as the reference (Gaia Collaboration et al. 2023)"),
        ("IRSA notes that it is intended for visualization", "IRSA notes that it is intended for visualization (Akeson et al. 2026b)"),
        ("The survey is not a simple \"two epochs per field per year\" cadence.", "The survey is not a simple \"two epochs per field per year\" cadence (Crill et al. 2020; Bock et al. 2026)."),
        ("The published numbers make the scale clear:", "The published numbers make the scale clear (Akeson et al. 2026a, 2026b):"),
    ],
    "02": [
        ("This document covers the algorithms I researched, the ones I used, and the ones I deliberately left out.",
         "This document covers the algorithms I researched, the ones I used, and the ones I deliberately left out. The algorithm choices follow the difference-imaging and reprojection literature (Alard & Lupton 1998; Bramich 2008; Zackay et al. 2016; Jacob et al. 2010; Robitaille et al. 2020)."),
        ("For multi-epoch work, the standard approach is to define a common tangent plane and reproject each image onto it.",
         "For multi-epoch work, the standard approach is to define a common tangent plane and reproject each image onto it (Jacob et al. 2010; Robitaille et al. 2020; Astropy Collaboration et al. 2022)."),
        ("The hard part is not the reprojection call. It is the background.", "The hard part is not the reprojection call. It is the background (Kelsall et al. 1998; Akeson et al. 2026a)."),
        ("The standard reference is Alard & Lupton's optimal image subtraction.", "The standard reference is Alard & Lupton's optimal image subtraction (Alard & Lupton 1998; Bramich 2008; Zackay et al. 2016)."),
        ("The test targets in the research plan are useful because they cover different regimes:", "The test targets in the research plan are useful because they cover different regimes (Barnard 1916; Luhman 2014):"),
        ("The 102 channels are not a single cube in the Level-2 data.", "The 102 channels are not a single cube in the Level-2 data (Akeson et al. 2026a; Bock et al. 2026)."),
        ("The app uses two catalog services:", "The app uses two catalog services (Gaia Collaboration et al. 2023; Cutri et al. 2013; Wright et al. 2010):"),
        ("The current parser is intentionally strict:", "The current parser is intentionally strict (Calabretta & Greisen 2002):"),
    ],
    "03": [
        ("The API is small on purpose.", "The API is small on purpose. The data model follows the FITS and WCS standards (Hanisch et al. 2001; Calabretta & Greisen 2002; Greisen et al. 2006)."),
        ("The find route is the one that matters most.", "The find route is the one that matters most (Akeson et al. 2026a)."),
        ("The cutout route does not accept an arbitrary URL.", "The cutout route does not accept an arbitrary URL (Calabretta & Greisen 2002)."),
        ("The spectrum route is the same cutout service", "The spectrum route is the same cutout service (Greisen et al. 2006)"),
        ("The catalog route uses Gaia TAP for Gaia and IRSA Gator for AllWISE.", "The catalog route uses Gaia TAP for Gaia and IRSA Gator for AllWISE (Gaia Collaboration et al. 2023; Cutri et al. 2013)."),
        ("I evaluated the public S3 bucket seriously.", "I evaluated the public S3 bucket seriously (Akeson et al. 2026b; Wilkinson et al. 2016)."),
        ("The research plan ended with a recommended stack.", "The research plan ended with a recommended stack. The WCS-aware reprojection recommendation is supported by Jacob et al. (2010), Robitaille et al. (2020), and Astropy Collaboration et al. (2022)."),
    ],
    "04": [
        ("This document covers the viewer choices", "This document covers the viewer choices (Akeson et al. 2026a, 2026b; Calabretta & Greisen 2002; Greisen et al. 2006)"),
        ("The browser parses the FITS file", "The browser parses the FITS file (Hanisch et al. 2001; Calabretta & Greisen 2002)"),
        ("The spectrum panel is a hand-drawn SVG, not Plotly or uPlot.", "The spectrum panel is a hand-drawn SVG, not Plotly or uPlot (Greisen et al. 2006; Akeson et al. 2026a)."),
        ("The server extracts the spectrum from a 24 x 2040 pixel strip.", "The server extracts the spectrum from a 24 x 2040 pixel strip (Greisen et al. 2006; Akeson et al. 2026a)."),
        ("The last one is the most valuable and the most expensive.", "The last one is the most valuable and the most expensive (Lang et al. 2010; Astropy Collaboration et al. 2022)."),
        ("The data citation is separate from the app citation.", "The data citation is separate from the app citation (Akeson et al. 2026a, 2026b; Crill et al. 2020; Bock et al. 2026)."),
    ],
}

TRANS = str.maketrans({
    "\u2019": "'",
    "\u2018": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u2212": "-",
    "\u00d7": "x",
    "\u2248": "~",
    "\u00b2": "^2",
    "\u2026": "...",
})


def clean(text: str) -> str:
    text = text.replace("\r\n", "\n")
    text = text.replace(API_TABLE_OLD, API_TABLE_NEW)
    text = text.replace(VALIDATION_TABLE_OLD, VALIDATION_TABLE_NEW)
    text = text.split("\n## Sources\n", 1)[0]
    text = re.sub(r"^##\s+(.+)$", lambda m: m.group(1).upper(), text, flags=re.M)
    text = re.sub(r"^#\s+(.+)$", lambda m: m.group(1), text, flags=re.M)
    text = text.replace("**", "").replace("`", "")
    text = text.replace("\u207b\u00b9", "^-1")
    text = text.translate(TRANS)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


def front_matter(title: str, number: str) -> str:
    return f"{title}\nResearch notes for the Drift SPHEREx viewer\nPrepared by Shaurjesh Basu\n14 November 2026\n\n"


def references(number: str) -> str:
    lines = ["REFERENCES", ""]
    lines.extend(REFS[key] for key in DOC_REFS[number])
    lines.extend(["", "DATA AND DOCUMENTATION", ""])
    lines.extend(URLS[number])
    return "\n".join(lines) + "\n"


for number, name in [
    ("01", "01-data-access-and-instrument-reality.md"),
    ("02", "02-science-algorithms-and-processing.md"),
    ("03", "03-backend-and-data-engineering.md"),
    ("04", "04-frontend-validation-and-operations.md"),
]:
    raw = (ROOT / name).read_text(encoding="utf-8")
    text = clean(raw)
    for old, new in CITES[number]:
        if old not in text:
            print(f"WARNING: citation anchor not found in {number}: {old[:70]}")
        text = text.replace(old, new, 1)
    text = text.replace("The point of the table is to keep the claims aligned with the data.", "The point of these examples is to keep the claims aligned with the data.")
    text = text.replace("The spectrum route is the same cutout service (Greisen et al. 2006) with a 24,2040pix strip.", "The spectrum route uses the same cutout service (Greisen et al. 2006; Akeson et al. 2026a) with a 24 x 2040 pixel strip.")
    text = text.replace("(MJy sr^-1)^2", "square MJy per steradian")
    text = text.replace("MJy sr^-1", "MJy per steradian")
    text = text.replace("arcsec yr^-1", "arcsec per year")
    text = text.replace("Astropy Collaboration et al. 2022", "Astropy Collaboration 2022")
    text = text.replace("Astropy Collaboration et al. (2022)", "Astropy Collaboration (2022)")
    text = text.replace("quoted slightly differently (Bock et al. 2026; Akeson et al. 2026a) in different mission papers", "quoted slightly differently in different mission papers (Bock et al. 2026; Akeson et al. 2026a)")
    text = text.replace("describes the variation (Crill et al. 2025) as continuous across the focal plane, with", "describes the variation as continuous across the focal plane (Crill et al. 2025), with")
    text = text.replace("undersampled (Akeson et al. 2026a; Anderson & King 2000) at the native 6.15 arcsec pixel scale.", "undersampled at the native 6.15 arcsec pixel scale (Akeson et al. 2026a; Anderson & King 2000).")
    text = text.replace("The cutout route does not accept an arbitrary URL (Calabretta & Greisen 2002).", "The cutout route does not accept an arbitrary URL (Akeson et al. 2026b).")
    title = text.splitlines()[0].strip()
    body = "\n".join(text.splitlines()[1:]).strip()
    output = front_matter(title, number) + body + "\n\n" + references(number)
    output = re.sub(r"[ \t]+\n", "\n", output)
    output = re.sub(r"\n{3,}", "\n\n", output)
    (OUT / f"{number}.txt").write_text(output + "\n", encoding="utf-8")
    print(f"wrote {OUT / (number + '.txt')} ({len(output.split())} words)")
