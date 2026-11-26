const viewport = document.querySelector('.network-window');
const operators = document.querySelector('.network-cards');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const copy = operators.cloneNode(true);
copy.setAttribute('aria-hidden', 'true');

let frame = 0;
let previousTime;
let distance = 0;

function advance(time) {
  if (previousTime !== undefined) {
    distance += Math.min(time - previousTime, 50) * .045;
    if (Math.abs(viewport.scrollLeft - distance) >= 1) {
      viewport.scrollLeft += Math.trunc(distance - viewport.scrollLeft);
    }
    const loopWidth = operators.offsetWidth;
    if (viewport.scrollLeft >= loopWidth) {
      viewport.scrollLeft -= loopWidth;
      distance -= loopWidth;
    }
  }
  previousTime = time;
  frame = requestAnimationFrame(advance);
}

function updatePlayback() {
  cancelAnimationFrame(frame);
  previousTime = undefined;
  distance = viewport.scrollLeft;
  const allowed = !reducedMotion.matches;
  if (allowed && !copy.isConnected) operators.after(copy);
  if (!allowed && copy.isConnected) {
    viewport.scrollLeft %= operators.offsetWidth;
    copy.remove();
  }

  if (allowed && !document.hidden && !viewport.matches(':hover, :focus-within')) {
    frame = requestAnimationFrame(advance);
  }
}

for (const event of ['pointerenter', 'pointerleave', 'focus', 'blur', 'touchend']) {
  viewport.addEventListener(event, updatePlayback);
}
document.addEventListener('visibilitychange', updatePlayback);
reducedMotion.addEventListener('change', updatePlayback);
updatePlayback();
