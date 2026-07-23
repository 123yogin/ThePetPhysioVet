document.querySelector(".sidebar-toggle")?.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
});

document.querySelectorAll(".sidebar .nav-item").forEach((link) => {
    link.addEventListener("click", () => {
        document.body.classList.remove("sidebar-open");
    });
});
