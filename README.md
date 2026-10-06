# POC-SCROM-Package

A dummy Learning Management System (LMS) to try out SCORM packages. The app has one screen:

1. Click the **+** card, or drag a SCORM `.zip` onto it.
2. The server extracts the zip and reads `imsmanifest.xml` to find the launch page, for example `index_lms.html`.
3. The course opens in the same screen, inside an iframe, with its `assets/`, `fonts/` and `content/` folders served next to it.

## Run it

```bash
npm install
npm start            # http://localhost:3000
```

To get a test package, run `npm run build:sample`. It creates `samples/sample-course.zip` with the usual SCORM 1.2 layout:

```
adlcp_rootv1p2.xsd  favicon.ico  imscp_rootv1p1p2.xsd  imsmanifest.xml
index_lms.html  index.html  assets/  fonts/  content/
```

## How it works

| File | Purpose |
| --- | --- |
| `server.js` | Express server. `POST /api/packages` takes the zip (field `package`) and extracts it to `uploads/<id>/`. It refuses zip entries that would write outside that folder. It then works out the launch file and serves it from `/packages/<id>/…`. |
| `public/index.html`, `app.js`, `styles.css` | The single screen: the upload card, the upload progress, and the course player. |
| `public/scorm-api.js` | A small SCORM runtime: `window.API` for 1.2 and `window.API_1484_11` for 2004. Courses look for this API in their parent window, so they can initialize, save status and score, and finish. Progress is saved in `localStorage`. |

How the launch page is chosen:

1. The `href` of the resource that the first organization item points to in `imsmanifest.xml`.
2. If that doesn't work, the first SCO or resource with an `href`.
3. If that doesn't work either, `index_lms.html`, `index.html`, `story.html` or `launch.html` in the package root.

The manifest can also sit inside a single top-level folder in the zip; the server finds it there.

The header shows the course title and the live lesson status and score that the course reports.

## Limits (it's a POC)

- Uploads are stored on local disk and never cleaned up. Delete `uploads/` to reset.
- Learner data is a fixed demo learner, and it is stored per browser, not per user.
- Only the first SCO is launched. Multi-SCO navigation and sequencing aren't supported.
