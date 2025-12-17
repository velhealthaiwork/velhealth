// Save queue in browser (demo)
function registerPatient() {
    const patient = {
        name: document.getElementById("name").value,
        doctor: document.getElementById("doctor").value,
        dept: document.getElementById("dept").value
    };

    const token = Math.floor(Math.random() * 900) + 100;

    localStorage.setItem("token", token);
    localStorage.setItem("pname", patient.name);
    localStorage.setItem("pdoctor", patient.doctor);
    localStorage.setItem("pdept", patient.dept);

    window.location = "/token";
}

window.onload = () => {
    if (document.getElementById("tokenNo")) {
        document.getElementById("tokenNo").innerText = localStorage.getItem("token");
        document.getElementById("tName").innerText = localStorage.getItem("pname");
        document.getElementById("tDoctor").innerText = localStorage.getItem("pdoctor");
        document.getElementById("tDept").innerText = localStorage.getItem("pdept");
    }
};
