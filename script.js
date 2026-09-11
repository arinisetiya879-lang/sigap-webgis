const screens = [...document.querySelectorAll(".screen")];
let current = 0;

function showScreen(index){
  current = Math.max(0, Math.min(index, screens.length - 1));
  screens.forEach((screen,i)=>screen.classList.toggle("active", i===current));
}

document.querySelectorAll("[data-next]").forEach(btn=>{
  btn.addEventListener("click",()=>showScreen(current+1));
});

document.querySelectorAll("[data-back]").forEach(btn=>{
  btn.addEventListener("click",()=>showScreen(current-1));
});

document.querySelectorAll("[data-skip]").forEach(btn=>{
  btn.addEventListener("click",()=>showScreen(3));
});

document.querySelector("[data-finish]").addEventListener("click",()=>showScreen(4));
document.querySelector("[data-restart]").addEventListener("click",()=>showScreen(0));

let startX = null;
document.addEventListener("touchstart", e=>{
  startX = e.touches[0].clientX;
},{passive:true});

document.addEventListener("touchend", e=>{
  if(startX === null) return;
  const dx = e.changedTouches[0].clientX - startX;
  if(Math.abs(dx)>60 && current>0 && current<4){
    if(dx<0) showScreen(current+1);
    if(dx>0) showScreen(current-1);
  }
  startX = null;
},{passive:true});
