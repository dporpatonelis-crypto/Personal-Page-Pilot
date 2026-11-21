const host = document.querySelector("#classroom-map");
const message = document.querySelector("#classroom-message");
const toolbar = document.querySelector("#classroom-nav");
const gradeSelect = document.querySelector("#class-grade");
const lessonSelect = document.querySelector("#class-lesson");
const todayButton = document.querySelector("#class-today");
const fullscreenButton = document.querySelector("#class-fullscreen");

function empty(title, detail) {
  const section = document.createElement("section");
  section.className = "classroom-empty";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = detail;
  section.append(heading, paragraph);
  host.replaceChildren(section);
}

function option(label, value) {
  return new Option(label, value);
}

function mapRoute(workspace, canvas = "") {
  return "#map/" + workspace + (canvas ? "/canvas/" + canvas : "");
}

async function boot() {
  const response = await fetch(new URL("data/classroom.json", import.meta.url), { cache: "no-cache" });
  if (!response.ok) throw Error("Ο κατάλογος μαθημάτων δεν είναι διαθέσιμος.");
  const edition = await response.json();
  if (edition.schema_version !== 1) throw Error("Χρειάζεται ανανέωση της σελίδας.");
  const mapRows = edition.documents.filter(row => row.kind === "workspace");
  if (!mapRows.length) {
    empty("Κανένα δημοσιευμένο μάθημα ακόμη", "Τα μαθήματα θα εμφανιστούν εδώ μετά τη δημοσίευσή τους από το Πιλοτήριο.");
    return;
  }

  const [{ createLessonMap }, { lmParseRoute }] = await Promise.all([
    import("./lesson-map.mjs"), import("./lesson-map-atlas.mjs")
  ]);
  const workspaces = new Map(mapRows.map(row => [row.document_id, row.document]));
  const canvases = new Map(edition.documents.filter(row => row.kind === "canvas")
    .map(row => [row.document_id, row.document]));
  const first = mapRows.find(row => row.document.grade === edition.grades[0]) || mapRows[0];
  const belongs = (workspace, canvas) =>
    workspaces.get(workspace)?.lessons.some(item => item.canvas_id === canvas);
  const activeRoute = () => {
    const route = lmParseRoute(location.hash);
    if (route && workspaces.has(route.workspaceId) &&
        (!route.canvasId || belongs(route.workspaceId, route.canvasId))) {
      return route;
    }
    if (location.hash) message.textContent = "Ο σύνδεσμος δεν αντιστοιχεί σε διαθέσιμο μάθημα της τρέχουσας έκδοσης.";
    return { workspaceId: first.document_id, canvasId: "" };
  };

  const start = activeRoute();
  let fromHistory = false;
  function updateNavigation(workspace, canvas, replace = false) {
    const grade = workspaces.get(workspace).grade;
    gradeSelect.value = grade;
    const groups = [];
    for (const [id, doc] of workspaces) {
      if (doc.grade !== grade) continue;
      const group = document.createElement("optgroup");
      group.label = doc.title;
      group.append(option("Χάρτης · " + doc.title, id));
      for (const cid of new Set(doc.lessons.map(item => item.canvas_id))) {
        group.append(option(canvases.get(cid).title, id + "/" + cid));
      }
      groups.push(group);
    }
    lessonSelect.replaceChildren(...groups);
    lessonSelect.value = workspace + (canvas ? "/" + canvas : "");
    const hash = mapRoute(workspace, canvas);
    if (!fromHistory && location.hash !== hash) {
      if (replace) history.replaceState(null, "", hash);
      else history.pushState(null, "", hash);
    }
  }

  gradeSelect.replaceChildren(...edition.grades.map(grade => option(grade, grade)));
  const renderer = createLessonMap(host, {
    registry: { scenarios: [], grades: edition.grades },
    privateMode: false,
    publication: edition,
    canvasId: start.canvasId,
    workspaceId: start.workspaceId,
    assetURL: path => new URL(path, import.meta.url).href,
    onNavigate: (workspace, canvas) => {
      if (!fromHistory) message.textContent = "";
      updateNavigation(workspace, canvas);
    },
  });
  await renderer.ready;
  updateNavigation(start.workspaceId, start.canvasId, true);
  toolbar.hidden = false;

  function open(workspace, canvas = "") {
    if (!workspaces.has(workspace) || (canvas && !belongs(workspace, canvas))) return;
    renderer.open(canvas || workspace, "", workspace);
  }
  gradeSelect.onchange = () => {
    const map = mapRows.find(row => row.document.grade === gradeSelect.value);
    if (map) open(map.document_id);
  };
  lessonSelect.onchange = () => open(...lessonSelect.value.split("/"));
  if (edition.today && belongs(edition.today.workspace_id, edition.today.canvas_id)) {
    todayButton.hidden = false;
    todayButton.onclick = () => open(edition.today.workspace_id, edition.today.canvas_id);
  }
  if (document.documentElement.requestFullscreen) {
    fullscreenButton.hidden = false;
    fullscreenButton.onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        message.textContent = "Η προβολή προσαρμόζεται στο διαθέσιμο παράθυρο.";
      }
    };
  }
  window.addEventListener("popstate", () => {
    message.textContent = "";
    const route = activeRoute();
    fromHistory = true;
    try {
      open(route.workspaceId, route.canvasId);
    } finally {
      fromHistory = false;
    }
  });
}

boot().catch(error => empty("Η προβολή τάξης δεν άνοιξε", error.message));
