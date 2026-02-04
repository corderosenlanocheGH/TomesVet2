const vetNameElements = document.querySelectorAll("[data-vet-name]");
const vetLogo = document.getElementById("vetLogo");
const vetNameInput = document.getElementById("vetNameInput");
const vetLogoInput = document.getElementById("vetLogoInput");
const vetSettingsForm = document.getElementById("vetSettingsForm");
const vetClearLogo = document.getElementById("vetClearLogo");
const titleTemplate = document.title;

const updateVetName = (name) => {
  vetNameElements.forEach((element) => {
    element.textContent = name;
  });

  if (titleTemplate.includes(" | ")) {
    const [page] = titleTemplate.split(" | ");
    document.title = `${page} | ${name}`;
  } else {
    document.title = name;
  }
};

const updateVetLogo = (dataUrl) => {
  if (!vetLogo) {
    return;
  }

  if (dataUrl) {
    vetLogo.src = dataUrl;
    vetLogo.classList.remove("d-none");
  } else {
    vetLogo.removeAttribute("src");
    vetLogo.classList.add("d-none");
  }
};

const storedName = localStorage.getItem("vetName");
if (storedName) {
  updateVetName(storedName);
  if (vetNameInput) {
    vetNameInput.value = storedName;
  }
}

const storedLogo = localStorage.getItem("vetLogo");
if (storedLogo) {
  updateVetLogo(storedLogo);
}

if (vetSettingsForm) {
  vetSettingsForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = vetNameInput?.value?.trim();
    if (name) {
      localStorage.setItem("vetName", name);
      updateVetName(name);
    }
  });
}

if (vetLogoInput) {
  vetLogoInput.addEventListener("change", (event) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl === "string") {
        localStorage.setItem("vetLogo", dataUrl);
        updateVetLogo(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  });
}

if (vetClearLogo) {
  vetClearLogo.addEventListener("click", () => {
    localStorage.removeItem("vetLogo");
    updateVetLogo(null);
    if (vetLogoInput) {
      vetLogoInput.value = "";
    }
  });
}
