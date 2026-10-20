const loginView = document.querySelector("#login-view");
const registerView = document.querySelector("#register-view");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const vault = document.querySelector("#digital-vault");

function initializeScrollReveals() {
  const revealItems = document.querySelectorAll("[data-scroll-reveal]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!revealItems.length || reduceMotion || !("IntersectionObserver" in window)) {
    return;
  }

  document.documentElement.classList.add("has-scroll-reveal");

  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: "0px 0px -8% 0px",
  });

  revealItems.forEach((item) => observer.observe(item));
}

function initializeScrollEffects() {
  const header = document.querySelector(".topbar");
  const parallaxItems = document.querySelectorAll("[data-parallax]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (header) {
    const updateHeader = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    };

    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }

  if (reduceMotion || !parallaxItems.length) {
    return;
  }

  let previousScrollY = window.scrollY;
  let pendingScroll = 0;
  let frameRequested = false;

  window.addEventListener("scroll", () => {
    pendingScroll += window.scrollY - previousScrollY;
    previousScrollY = window.scrollY;

    if (frameRequested) {
      return;
    }

    frameRequested = true;
    window.requestAnimationFrame(() => {
      parallaxItems.forEach((item) => {
        const configuredSpeed = Number.parseFloat(item.dataset.parallaxSpeed);
        const speed = Number.isFinite(configuredSpeed) ? configuredSpeed : 0.08;
        const offset = Number.parseFloat(item.style.getPropertyValue("--parallax-y")) || 0;
        const nextOffset = Math.max(-36, Math.min(36, offset + pendingScroll * speed));
        item.style.setProperty("--parallax-y", `${nextOffset.toFixed(1)}px`);
      });

      pendingScroll = 0;
      frameRequested = false;
    });
  }, { passive: true });
}

function showView(viewName) {
  const showLogin = viewName === "login";
  loginView.hidden = !showLogin;
  registerView.hidden = showLogin;

  document.querySelectorAll(".tab[data-view]").forEach((tab) => {
    const selected = tab.dataset.view === viewName;

    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });

  const heading = showLogin ? "#login-title" : "#register-title";
  document.querySelector(heading).focus({ preventScroll: true });
}

document.querySelectorAll("[data-view], [data-switch-view]").forEach((button) => {
  const viewName = button.dataset.view || button.dataset.switchView;
  button.addEventListener("click", () => showView(viewName));
});

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const passwordInput = document.getElementById(button.dataset.passwordToggle);
    const showPassword = passwordInput.type === "password";

    passwordInput.type = showPassword ? "text" : "password";
    button.textContent = showPassword ? "⊘" : "◉";
    button.setAttribute("aria-label", showPassword ? "Hide password" : "Show password");
    button.setAttribute("aria-pressed", String(showPassword));
  });
});

initializeScrollReveals();
initializeScrollEffects();

function setMessage(element, text, isSuccess) {
  element.textContent = text;
  element.classList.toggle("is-success", isSuccess);
}

function setLoading(form, button, isLoading, loadingText) {
  const label = button.querySelector(".button-text");

  if (!button.dataset.originalText) {
    button.dataset.originalText = label.textContent;
  }

  form.setAttribute("aria-busy", String(isLoading));
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
  label.textContent = isLoading ? loadingText : button.dataset.originalText;
}

async function sendPassword(endpoint, password) {
  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch {
    throw new Error("Could not reach the locker server. Make sure the web server is running.");
  }

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response. Please try again.");
  }

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("The server returned an unexpected response. Please try again.");
  }

  if (!response.ok || result.ok !== true) {
    const serverMessage = typeof result.error === "string" ? result.error.trim() : "";
    throw new Error(serverMessage || "The request did not succeed. Please check and try again.");
  }

  return result;
}

const loginMessage = document.querySelector("#login-message");
const loginButton = document.querySelector("#login-button");

if (loginForm && loginButton) {
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginButton.disabled) {
    return;
  }

  setMessage(loginMessage, "", false);

  const password = document.querySelector("#login-password").value;
  if (!password) {
    setMessage(loginMessage, "Enter your master password to continue.", false);
    document.querySelector("#login-password").focus();
    return;
  }

  setLoading(loginForm, loginButton, true, "Checking password...");

  try {
    await sendPassword("/api/login", password);
    vault.classList.add("is-unlocked");
    setMessage(loginMessage, "Password accepted.", true);
  } catch (error) {
    setMessage(loginMessage, error.message, false);
  } finally {
    setLoading(loginForm, loginButton, false, "");
  }
});
}

const registerMessage = document.querySelector("#register-message");
const registerButton = document.querySelector("#register-button");

if (registerForm && registerButton) {
registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (registerButton.disabled) {
    return;
  }

  setMessage(registerMessage, "", false);

  const password = document.querySelector("#register-password").value;
  const confirmation = document.querySelector("#confirm-password").value;

  if (!password) {
    setMessage(registerMessage, "Choose a master password to create your locker.", false);
    document.querySelector("#register-password").focus();
    return;
  }

  if (password !== confirmation) {
    setMessage(registerMessage, "Those passwords do not match. Please check both fields.", false);
    document.querySelector("#confirm-password").focus();
    return;
  }

  setLoading(registerForm, registerButton, true, "Creating locker...");

  try {
    await sendPassword("/api/register", password);
    registerForm.reset();
    showView("login");
    setMessage(loginMessage, "Locker created.", true);
    document.querySelector("#login-password").focus();
  } catch (error) {
    setMessage(registerMessage, error.message, false);
  } finally {
    setLoading(registerForm, registerButton, false, "");
  }
});
}