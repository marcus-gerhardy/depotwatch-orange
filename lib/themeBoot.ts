// The theme has to be on <html> before the first pixel is painted, otherwise a
// dark-theme user sees a flash of the default one on every load (CLAUDE.md §5).
// React cannot do that — it runs after the paint — so this tiny script does,
// inline in <head>, reading the same device preference the store reads later.
//
// It is deliberately dependency-free and defensive: private mode, disabled
// storage or a half-written value must not throw, because a throwing head
// script would take the page with it.

export const APPEARANCE_KEY = "depotwatch.appearance";

export const THEME_BOOT_SCRIPT = `(function(){try{
var d=document.documentElement,s=localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)});
var a=s?JSON.parse(s):null;
if(!a){var legacy=localStorage.getItem("depotwatch.theme");if(legacy)a={mode:"fixed",theme:legacy};}
if(!a)return;
var dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;
var t=a.mode==="system"?(dark?a.dark:a.light):a.theme;
if(t)d.setAttribute("data-theme",t);
if(a.colorBlindSafe)d.setAttribute("data-colorblind","safe");
}catch(e){}})();`;
