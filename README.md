# POC-SCROM-Package

A dummy Learning Management System (LMS) to try out SCORM packages. The app has one screen:

1. Click the **+** card, or drag a SCORM `.zip` onto it.
2. The server extracts the zip and opens `index_local.html`. If the package doesn't have one, it uses the launch page named in `imsmanifest.xml`.
3. The course opens in the same screen, inside an iframe, with its `assets/`, `fonts/` and `content/` folders served next to it.

## Run it

```bash
npm install
npm start            # http://localhost:3000
```

To get a test package, run `npm run build:sample`. It creates `samples/sample-course.zip` with the usual SCORM 1.2 layout:

```
adlcp_rootv1p2.xsd  favicon.ico  ims_xml.xsd  imscp_rootv1p1p2.xsd  imsmanifest.xml
imsmd_rootv1p2p1.xsd  index.html  index_local.html  v.json  assets/  fonts/  content/
```

## How it works

| File | Purpose |
| --- | --- |
| `server.js` | Express server. `POST /api/packages` takes the zip (field `package`) and extracts it to `uploads/<id>/`. It refuses zip entries that would write outside that folder. It then works out the launch file and serves it from `/packages/<id>/…`. |
| `public/index.html`, `app.js`, `styles.css` | The single screen: the upload card, the upload progress, and the course player. |
| `public/scorm-api.js` | A small SCORM runtime: `window.API` for 1.2 and `window.API_1484_11` for 2004. Courses look for this API in their parent window, so they can initialize, save status and score, and finish. Progress is saved in `localStorage`. |

How the launch page is chosen:

1. `index_local.html` (or `index_lms.html`) if it's in the package root. This is the full, self-contained course page that some authoring tools export.
2. If it's missing, the `href` that `imsmanifest.xml` gives for the first lesson (usually `index.html`).
3. If that's missing too, `index.html`, `story.html` or `launch.html` in the package root.

If the package has more than one HTML page, a **Page** menu appears in the header. Use it to switch, for example between `index_local.html` and `index.html`. The page the manifest points to is labelled "(manifest)".

The manifest can also sit inside a single top-level folder in the zip; the server finds it there.

The header shows the course title and the live lesson status and score that the course reports.

## Limits (it's a POC)

- Uploads are stored on local disk and never cleaned up. Delete `uploads/` to reset.
- Learner data is a fixed demo learner, and it is stored per browser, not per user.
- Only the first SCO is launched. Multi-SCO navigation and sequencing aren't supported.
