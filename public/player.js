(() => {
const root = document.createElement("section");
root.id = "wakie-fm-player";

root.innerHTML = `
<div class="wfm-box">
<h2>🎵 Wakie FM Player</h2>
<div id="wfm-now">No song playing</div>
<div id="wfm-video"></div>
<button id="wfm-listen">▶ Tap to listen</button>

<div class="wfm-dj">
<h3>DJ Controls</h3>
<input id="wfm-password" type="password"
placeholder="DJ password">
<input id="wfm-song" type="text"
placeholder="Paste YouTube link or video ID">
<button id="wfm-load">Load and Play Song</button>
<button id="wfm-pause">Pause</button>
<button id="wfm-resume">Resume</button>
<p id="wfm-message"></p>
</div>
</div>
`;

const style = document.createElement("style");
style.textContent = `
#wakie-fm-player {
margin: 20px auto;
padding: 12px;
max-width: 600px;
font-family: Arial, sans-serif;
}
.wfm-box {
background: #211333;
color: white;
padding: 18px;
border-radius: 18px;
text-align: center;
}
.wfm-box h2 { color: #d7a8ff; }
#wfm-now { margin: 12px; }
#wfm-video { width: 100%; aspect-ratio: 16/9; }
#wfm-video iframe { width: 100%; height: 100%; }
.wfm-box button {
background: #9b59d0;
color: white;
border: 0;
border-radius: 10px;
padding: 12px;
margin: 6px;
cursor: pointer;
}
.wfm-box input {
box-sizing: border-box;
width: 100%;
padding: 12px;
margin: 6px 0;
border-radius: 8px;
border: 1px solid #aaa;
}
.wfm-dj {
border-top: 1px solid #68458a;
margin-top: 20px;
padding-top: 12px;
}
`;

document.head.appendChild(style);
document.body.prepend(root);

let player;
let isDJ = false;
let password = "";
let currentVideo = "";
let lastState = "";
let lastUpdate = "";

const message = (text) => {
document.getElementById("wfm-message").textContent = text;
};

function getVideoId(value) {
value = value.trim();
if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

try {
const url = new URL(value);
if (url.hostname.includes("youtu.be")) {
return url.pathname.slice(1).split("/")[0];
}
return url.searchParams.get("v") ||
url.pathname.split("/").filter(Boolean).pop();
} catch {
return "";
}
}

async function updateDJ(status, position) {
const response = await fetch("/api/dj/playback", {
method: "POST",
headers: {
"Content-Type": "application/json",
"Authorization": "Bearer " + password
},
body: JSON.stringify({
video_id: currentVideo,
status,
position_seconds: position
})
});

const result = await response.json();
if (!response.ok) throw new Error(result.error || "Update failed");
return result;
}

function loadYouTubeAPI() {
if (window.YT && window.YT.Player) {
createPlayer();
return;
}

const previous = window.onYouTubeIframeAPIReady;
window.onYouTubeIframeAPIReady = () => {
if (previous) previous();
createPlayer();
};

if (!document.querySelector(
'script[src="https://www.youtube.com/iframe_api"]'
)) {
const script = document.createElement("script");
script.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(script);
}
}

function createPlayer() {
if (player) return;

player = new YT.Player("wfm-video", {
videoId: "",
playerVars: { playsinline: 1 },
events: {
onStateChange: async (event) => {
if (!isDJ || !currentVideo) return;

try {
if (event.data === YT.PlayerState.PLAYING) {
await updateDJ("playing", player.getCurrentTime());
} else if (event.data === YT.PlayerState.PAUSED) {
await updateDJ("paused", player.getCurrentTime());
} else if (event.data === YT.PlayerState.ENDED) {
await updateDJ("stopped", 0);
}
} catch (error) {
message(error.message);
}
}
}
});
}

document.getElementById("wfm-load").onclick = async () => {
password = document.getElementById("wfm-password").value;
const video = getVideoId(
document.getElementById("wfm-song").value
);

if (!password || !video) {
message("Enter your DJ password and a valid YouTube link.");
return;
}

try {
currentVideo = video;
await updateDJ("playing", 0);
isDJ = true;
player.loadVideoById(video);
message("Song loaded. DJ controls enabled.");
} catch (error) {
isDJ = false;
message(error.message);
}
};

document.getElementById("wfm-pause").onclick = async () => {
if (!isDJ || !player) return;
player.pauseVideo();
try {
await updateDJ("paused", player.getCurrentTime());
} catch (error) {
message(error.message);
}
};

document.getElementById("wfm-resume").onclick = async () => {
if (!isDJ || !player) return;
player.playVideo();
try {
await updateDJ("playing", player.getCurrentTime());
} catch (error) {
message(error.message);
}
};

document.getElementById("wfm-listen").onclick = () => {
if (player) player.playVideo();
};

async function syncPlayback() {
try {
const response = await fetch("/api/playback");
const result = await response.json();
const state = result.playback;
if (!state || isDJ || !state.video_id) return;

document.getElementById("wfm-now").textContent =
state.status === "stopped"
? "Playback stopped"
: "Now playing on Wakie FM";

const changed = state.video_id !== currentVideo;
if (changed) {
currentVideo = state.video_id;
player.loadVideoById(state.video_id);
lastState = "";
lastUpdate = "";
return;
}

if (state.status === "stopped") {
player.stopVideo();
return;
}

const elapsed = Math.max(
0,
(Date.now() - new Date(state.updated_at).getTime()) / 1000
);

const target = Number(state.position_seconds) +
(state.status === "playing" ? elapsed : 0);

if (player.getPlayerState() !== -1) {
const drift = Math.abs(player.getCurrentTime() - target);
if (drift > 2) player.seekTo(target, true);
}

if (state.status === "playing" &&
player.getPlayerState() !== YT.PlayerState.PLAYING) {
player.playVideo();
}

if (state.status === "paused" &&
player.getPlayerState() === YT.PlayerState.PLAYING) {
player.pauseVideo();
}

lastState = state.status;
lastUpdate = state.updated_at;
} catch (error) {
console.error("Wakie FM sync error:", error);
}
}

loadYouTubeAPI();
setInterval(() => {
if (player && player.getPlayerState) syncPlayback();
}, 4000);

setInterval(async () => {
if (isDJ && player &&
player.getPlayerState() === YT.PlayerState.PLAYING) {
try {
await updateDJ("playing", player.getCurrentTime());
} catch (error) {
message(error.message);
}
}
}, 5000);
})();
