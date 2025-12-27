let currentsong = new Audio();
let songs;
let currfolder;

function convertSecondsToTime(seconds) {
  if (isNaN(seconds) || seconds < 0) {
    return "00:00";
  }

  // Calculate minutes and remaining seconds
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  // Ensure minutes and seconds are two digits
  const formattedMinutes = String(minutes).padStart(2, "0");
  const formattedSeconds = String(remainingSeconds).padStart(2, "0");

  return `${formattedMinutes}:${formattedSeconds}`;
}

async function getSongs(folder) {
  // Normalize folder (convert backslashes, strip leading/trailing slashes) and store current folder
  currfolder = String(folder)
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  console.debug(`[getSongs] requesting directory /${currfolder}/`);
  let a;
  try {
    a = await fetch(`/${currfolder}/`);
    if (!a.ok) throw new Error("Failed to fetch directory");
  } catch (err) {
    // Show no songs and return empty list on error
    let songUL = document
      .querySelector(".songlist")
      .getElementsByTagName("ul")[0];
    if (songUL) songUL.innerHTML = "<li>No songs found</li>";
    console.debug(`[getSongs] fetch failed for /${currfolder}/`, err);
    return [];
  }

  let response = await a.text();
  let div = document.createElement("div");
  div.innerHTML = response;
  let as = div.getElementsByTagName("a");
  console.debug(`[getSongs] found ${as.length} anchors in /${currfolder}/`);
  songs = [];
  for (let index = 0; index < as.length; index++) {
    const element = as[index];
    // Prefer the raw href attribute (relative paths from the directory listing)
    const hrefAttr =
      element.getAttribute && element.getAttribute("href")
        ? element.getAttribute("href")
        : element.href || "";
    if (hrefAttr && hrefAttr.toLowerCase().endsWith(".mp3")) {
      // Normalize backslashes to forward slashes, strip query params and extract only the filename
      const raw = hrefAttr.split("?")[0].replace(/\\/g, "/");
      const segments = raw.split("/").filter(Boolean);
      const filename = decodeURIComponent(segments[segments.length - 1]);
      // Extra sanitization: ensure the final stored name has no leftover path fragments or backslashes
      const safeFilename = String(filename)
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean)
        .slice(-1)[0];
      // Store sanitized filename only (basename)
      songs.push(safeFilename.trim());
    }
  }
  console.debug(
    `[getSongs] parsed ${songs.length} mp3 files for /${currfolder}/`,
    songs
  );

  //Show all the songs in the playlist
  let songUL = document
    .querySelector(".songlist")
    .getElementsByTagName("ul")[0];
  songUL.innerHTML = "";
  if (!songs || songs.length === 0) {
    songUL.innerHTML = "<li>No songs found</li>";
  } else {
    for (const song of songs) {
      const safeName = String(song)
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean)
        .slice(-1)[0];
      songUL.innerHTML =
        songUL.innerHTML +
        `<li data-file="${encodeURIComponent(safeName)}">
                                 <img class="invert" src="img/music.svg" alt="">
                                 <div class="info">
                                     <div class="song-name">${decodeURIComponent(
                                       safeName
                                     )}</div>
                                     <div>Sapna</div>
                                 </div>
                                 <div class="playnow">
                                     <img  class="invert " src="img/play.svg" alt="">
                                 </div> </li>`;
    }
  }
  // Attach an event listener to each song
  Array.from(
    document.querySelector(".songlist").getElementsByTagName("li")
  ).forEach((e) => {
    e.addEventListener("click", (element) => {
      // Use the raw filename stored in data-file (decode it) to ensure the correct track is played
      const file = e.dataset.file ? decodeURIComponent(e.dataset.file) : null;
      if (file) playmusic(file);
    });
  });

  return songs;
}

const playmusic = (track, pause = false) => {
  if (!track) return;
  // Normalize to filename (last path segment) to avoid duplicated folder paths
  const filename = String(track)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .slice(-1)[0];
  // Build a clean base path and encode the filename for the URL
  const base = currfolder
    ? currfolder.startsWith("/")
      ? currfolder
      : `/${currfolder}`
    : "";
  // Pause any existing playback before switching source to avoid race conditions
  try {
    currentsong.pause();
  } catch (err) {
    /* ignore */
  }
  currentsong.src = `${base}/${encodeURIComponent(filename)}`;

  if (!pause) {
    const playPromise = currentsong.play();
    if (playPromise !== undefined && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          play.src = "img/pause.svg";
        })
        .catch((err) => {
          // Ignore AbortError which happens when the source changes quickly; log others
          if (!err || err.name !== "AbortError")
            console.error("Playback error:", err);
        });
    } else {
      play.src = "img/pause.svg";
    }
  }
  document.querySelector(".songinfo").innerHTML = decodeURIComponent(filename);
  document.querySelector(".songtime").innerHTML = "00:00 / 00:00";
};

async function displayAlbums() {
  let a = await fetch(`/songs/`);
  let response = await a.text();
  let div = document.createElement("div");
  div.innerHTML = response;
  let anchors = div.getElementsByTagName("a");
  let cardContainer = document.querySelector(".cardContainer");
  if (!cardContainer) return; // nothing to render to
  // Preserve heading if present and clear previous cards before rendering to avoid duplicates
  const heading = cardContainer.querySelector("h1");
  const headerHTML = heading ? heading.outerHTML : "<h1>Popular artists</h1>";
  cardContainer.innerHTML = headerHTML;
  let array = Array.from(anchors);
  const folders = new Set();

  for (let index = 0; index < array.length; index++) {
    const e = array[index];

    // Use href attribute and normalize backslashes so folder detection is robust
    const hrefAttr =
      e.getAttribute && e.getAttribute("href")
        ? e.getAttribute("href")
        : e.href || "";
    const rawHref = hrefAttr.split("?")[0].replace(/\\/g, "/");
    const segments = rawHref.split("/").filter(Boolean);

    // Detect folder links robustly:
    // 1) If the href references `/songs/<folder>/`, use that folder
    // 2) Otherwise if it's a relative directory link (endsWith '/'), use the last segment (e.g. 'cs/')
    let folder = null;
    if (rawHref.includes("/songs/")) {
      const songsIndex = segments.indexOf("songs");
      if (songsIndex >= 0 && segments.length > songsIndex + 1) {
        folder = decodeURIComponent(segments[songsIndex + 1]);
      }
    } else if (rawHref.endsWith("/")) {
      const candidate = segments[segments.length - 1];
      if (candidate && candidate !== ".." && candidate !== "songs")
        folder = decodeURIComponent(candidate);
    }

    if (!folder || folder === "songs" || folder === "..") continue;
    // Normalize folder for use in URLs: strip leading/trailing slashes and any leading 'songs/' to avoid duplication
    let renderFolder = String(folder)
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "")
      .replace(/^songs\//, "")
      .trim();
    if (!renderFolder) continue;
    if (folders.has(renderFolder)) continue; // already added
    folders.add(renderFolder);

    // Get the metadata of the folder (fallback to folder name when info.json is missing)
    try {
      console.debug(
        `[displayAlbums] fetching info for folder: ${renderFolder} (original: ${folder})`
      );
      let a = await fetch(`/songs/${renderFolder}/info.json`);
      if (!a.ok) throw new Error("info.json not found");
      let response = await a.json();
      const title = response && response.title ? response.title : renderFolder;
      const description =
        response && response.description
          ? response.description
          : "No description";
      cardContainer.innerHTML += `<div data-folder="${renderFolder}" class="card">
                        <div class="play-button ">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"
                                fill="#1ed760">
                                <circle cx="12" cy="12" r="10" stroke="#1ed760" stroke-width="3.5" fill="#1ed760" />
                                <path d="M8.5 8L16.5 12L8.5 16.5Z" fill="black" />
                            </svg>
                        </div>

                        <img src="/songs/${renderFolder}/cover.jpg" alt="${title} cover" onerror="this.src='img/music.svg'">
                        <h3 class="artist-name">${title}</h3>
                        <p class="artist-name">${description}</p>
                    </div>`;
    } catch (err) {
      console.debug(
        `[displayAlbums] info fetch failed for ${renderFolder} (original: ${folder})`,
        err
      );
      cardContainer.innerHTML += `<div data-folder="${renderFolder}" class="card">
                        <div class="play-button ">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"
                                fill="#1ed760">
                                <circle cx="12" cy="12" r="10" stroke="#1ed760" stroke-width="3.5" fill="#1ed760" />
                                <path d="M8.5 8L16.5 12L8.5 16.5Z" fill="black" />
                            </svg>
                        </div>

                        <img src="/songs/${renderFolder}/cover.jpg" alt="${renderFolder} cover" onerror="this.src='img/music.svg'">
                        <h3 class="artist-name">${renderFolder}</h3>
                        <p class="artist-name">No description</p>
                    </div>`;
    }
  }
  // If we couldn't find any valid album folders, show a message (keep header)
  if (folders.size === 0) {
    cardContainer.innerHTML += '<div class="no-albums">No albums found</div>';
  }

  // Load the playlist whenever the card is clicked (attach listeners once after all cards are rendered)
  Array.from(document.getElementsByClassName("card")).forEach((e) => {
    if (!e.dataset.listenerAttached) {
      e.addEventListener("click", async (item) => {
        // Capture the clicked card element immediately to avoid event.currentTarget being null after async awaits
        const cardEl =
          item.currentTarget ||
          (item.target && item.target.closest && item.target.closest(".card"));
        const folder = cardEl
          ? cardEl.dataset.folder
          : item.currentTarget && item.currentTarget.dataset
          ? item.currentTarget.dataset.folder
          : null;

        // Mark the clicked card as active immediately
        document
          .querySelectorAll(".card")
          .forEach((c) => c.classList.remove("active"));
        if (cardEl) cardEl.classList.add("active");

        // Show loading state in the library
        const songUL = document
          .querySelector(".songlist")
          .getElementsByTagName("ul")[0];
        if (songUL) songUL.innerHTML = "<li>Loading...</li>";

        if (!folder) {
          if (songUL) songUL.innerHTML = "<li>No songs found</li>";
          return;
        }

        songs = await getSongs(`songs/${folder}`);

        // Open the library panel so the user can see the playlist
        const left = document.querySelector(".left");
        if (left) left.style.left = "0";

        if (songs && songs.length > 0) {
          playmusic(songs[0]);
        } else {
          if (songUL) songUL.innerHTML = "<li>No songs found</li>";
        }
      });
      e.dataset.listenerAttached = "1";
    }
  });
}

async function main() {
  //Get the list of all songs
  songs = await getSongs("songs/cs");
  // Only play if we have at least one song
  if (songs && songs.length > 0) {
    playmusic(songs[0], true);
  } else {
    document.querySelector(".songinfo").innerHTML = "No songs";
  }

  // Display all tha albums on the page
  displayAlbums();

  //Attach an eventlistener to play next and previous
  play.addEventListener("click", () => {
    if (currentsong.paused) {
      currentsong.play();
      play.src = "img/pause.svg";
    } else {
      currentsong.pause();
      play.src = "img/play.svg";
    }
  });

  // Listen for time update event
  currentsong.addEventListener("timeupdate", () => {
    document.querySelector(".songtime").innerHTML = `${convertSecondsToTime(
      currentsong.currentTime
    )}/${convertSecondsToTime(currentsong.duration)}`;
    document.querySelector(".circle").style.left =
      (currentsong.currentTime / currentsong.duration) * 100 + "%";
  });

  // Add a eventlistener to seekbar
  document.querySelector(".seekbar").addEventListener("click", (e) => {
    let percent = (e.offsetX / e.target.getBoundingClientRect().width) * 100;
    document.querySelector(".circle").style.left = percent + "%";
    currentsong.currentTime = (currentsong.duration * percent) / 100;
  });

  // Add an eventlistner for hameburger
  document.querySelector(".hameburger").addEventListener("click", () => {
    document.querySelector(".left").style.left = "0";
  });

  // Add an eventlistner to fo close butten
  document.querySelector(".close").addEventListener("click", () => {
    document.querySelector(".left").style.left = "-110%";
  });

  // Add eventlistner to previous and next song buttons

  previous.addEventListener("click", () => {
    console.log("previous clicked");
    currentsong.pause();
    const currentFilename = decodeURIComponent(
      currentsong.src.split("/").slice(-1)[0] || ""
    );
    let index = songs.indexOf(currentFilename);

    if (index - 1 >= 0) {
      playmusic(songs[index - 1]);
    }
  });

  next.addEventListener("click", () => {
    currentsong.pause();
    console.log("Next clicked");

    const currentFilename = decodeURIComponent(
      currentsong.src.split("/").slice(-1)[0] || ""
    );
    let index = songs.indexOf(currentFilename);

    if (index + 1 < songs.length) {
      playmusic(songs[index + 1]);
    }
  });

  // Add an eventlistener to volume
  document
    .querySelector(".range")
    .getElementsByTagName("input")[0]
    .addEventListener("change", (e) => {
      console.log("Setting volume to ", e.target.value, "/ 100");
      currentsong.volume = parseInt(e.target.value) / 100;

      const volumeImg = document.querySelector(".volume img");

      if (e.target.value == 0) {
        volumeImg.src = "img/mute.svg"; // Change to the new SVG image when volume is 0
      } else {
        volumeImg.src = "img/volume.svg"; // Change back to the original SVG image when volume is not 0
      }
    });

  // Add an event listener to mute the track
  document.querySelector(".volume > img").addEventListener("click", (e) => {
    if (e.target.src.includes("img/volume.svg")) {
      e.target.src = e.target.src.replace("img/volume.svg", "mute.svg");
      currentsong.volume = 0;
      document
        .querySelector(".range")
        .getElementsByTagName("input")[0].value = 0;
    } else {
      e.target.src = e.target.src.replace("mute.svg", "volume.svg");
      currentsong.volume = 0.1;
      document
        .querySelector(".range")
        .getElementsByTagName("input")[0].value = 10;
    }
  });
}

main();

// spotify Clone (HTML, CSS, JavaScript)
// Designed a responsive UI replicating spotify’s layout.
// Added basic music player functionality with JavaScript, including play, pause, next, and previous controls.
// Implemented dynamic playlist generation, album display, and volume control features.
