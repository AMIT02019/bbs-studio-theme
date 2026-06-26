function toggleFilter() {
    let x = document.querySelector(".sq-filter-main");
    x.classList.toggle("opening");
}
function toggleClass() {
    let y = document.querySelector(".sq-filter-main");
    y.classList.remove("opening");
}
function removeClass() {
    let z = document.querySelector(".sq-filter-main");
    z.classList.remove("opening");
}

window.sq = window.sq || {};


window.addEventListener("load", () => {
    if (window.matchMedia("(max-width: 767px)").matches) {
        document
            .getElementById("Search-In-Modal")
            .addEventListener("focusin", () => {
                document.querySelector(".sq-dropdown-body").style.maxHeight = "100%";
            });
        document
            .getElementById("Search-In-Modal")
            .addEventListener("focusout", () => {
                document.querySelector(".sq-dropdown-body").style.maxHeight = "0px";
            });
    }
});

window.sq.initSearch = (store) => {
    store.search();
};


setTimeout(()=>{
    if(document.querySelector(".sq-filter-main")) document.querySelector(".sq-filter-main").style.visibility=null;
    if(document.querySelector(".sparq-container")) document.querySelector(".sparq-container").style.visibility=null;
},200);

window.addEventListener("keydown",(e)=>{
    if (e.key === "Escape") {
        document.querySelector("footer").click();
    }
});



