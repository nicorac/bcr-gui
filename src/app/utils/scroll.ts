export function bringIntoView(querySelector: string) {

  setTimeout(() => {
    const elem = document.querySelector(querySelector);
    if (elem) {
      elem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, 0);

}