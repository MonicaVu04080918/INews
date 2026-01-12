// const deployedLink = "https://testertester-production.up.railway.app"

// const localLink = "http://localhost:5000"
import { API_URL } from "./config.js";
let isDark = false;




// If the user is already logged in, don't show them the login page.
// Redirect them to the main application.
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (token) {
    alert("Sorry, you are already logged in.");
    window.location.href = "index.html";
    return; // Stop running any other code on this page
  }


  document.getElementById("showLogin").addEventListener("click", () => {
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("signupForm").classList.add("hidden");
    document.getElementById("showLogin").classList.add("active");
    document.getElementById("showSignup").classList.remove("active");
  });

  document.getElementById("showSignup").addEventListener("click", () => {
    document.getElementById("signupForm").classList.remove("hidden");
    document.getElementById("loginForm").classList.add("hidden");
    document.getElementById("showSignup").classList.add("active");
    document.getElementById("showLogin").classList.remove("active");
  });
  console.log("DOM loaded. Finding elements...");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const forgotForm = document.getElementById("forgotForm");

  const showLogin = document.getElementById("showLogin");
  const showSignup = document.getElementById("showSignup");
  const showForgotPassword = document.getElementById("showForgotPassword");
  const backToLogin = document.getElementById("backToLogin");
  console.log("loginForm:", loginForm);
  console.log("forgotForm:", forgotForm);
  console.log("showForgotPassword:", showForgotPassword);
  console.log("backToLogin:", backToLogin);
  if (showForgotPassword){
    showForgotPassword.addEventListener("click", () => {
    loginForm.classList.add("hidden");
    signupForm.classList.add("hidden");
    forgotForm.classList.remove("hidden");
    });
  }
  if (backToLogin){
    backToLogin.addEventListener("click", () => {
      loginForm.classList.remove("hidden");
      signupForm.classList.add("hidden");
      forgotForm.classList.add("hidden");
      showLogin.classList.add("active");
      showSignup.classList.remove("active");
    });
  }
});
async function checkOnboardingStatus(token) {
  try {
    // Use the plural /users/status endpoint
    const res = await fetch(`${API_URL}/api/users/status`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      // If the token is bad or expired, treat as incomplete/error
      return false;
    }

    const data = await res.json();
    // Return true if onboarding is complete, false otherwise
    return data.onboardingComplete === true;

  } catch (error) {
    console.error("Error checking onboarding status:", error);
    // On network error, assume incomplete to be safe
    return false;
  }
}
async function signup() {
  const name = document.getElementById("signupName").value;
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;

  const res = await fetch(`${API_URL}/api/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  const data = await res.json();

  if (res.ok) {
    console.log("Token received:", data.token);
    //console.log("User ID received:", data.user.id); // Check this value
    console.log("User Email received:", data.user.email);
    localStorage.setItem("token", data.token);
    localStorage.setItem("username", data.user.name);
    //localStorage.setItem("loggedInUser", email);
    //localStorage.setItem("userId", data.user.id);

    // Redirectto onboarding
    window.location.href = "onBoarding.html";
  } else {
    document.getElementById("message").innerText = data.message;
  }
}

async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  const res = await fetch(`${API_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (res.ok) {
    console.log("Token received:", data.token);
    //console.log("User ID received:", data.user.id); // Check this value
    console.log("User Email received:", data.user.email);
    localStorage.setItem("token", data.token);
    localStorage.setItem("username", data.user.name);
    //localStorage.setItem("loggedInUser", email);
    //localStorage.setItem("userId", data.user.id);
    alert("Login successful!");
    // onboarding check for logged in users
    //const onboardingKey = `${email}_hasCompletedOnboarding`;
    //const hasCompletedOnboarding = localStorage.getItem(onboardingKey);
    //if (!hasCompletedOnboarding) {
    //window.location.href = "onBoarding.html";
    //} else {
    //  window.location.href = "index.html";
    //}
    const isComplete = await checkOnboardingStatus(data.token);

    if (isComplete) {
      window.location.href = "index.html"; // Redirects straight to feed!
    } else {
      window.location.href = "onBoarding.html"; // Only redirects here if incomplete
    }
  } else {
    document.getElementById("message").innerText = data.message;
    alert("Login failed: " + data.message);
  }
}
async function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("loggedInUser");
  localLinkalStorage.removeItem("username");
  window.location.href = "login.html";
}

async function requestPasswordReset(){
  const email = document.getElementById("forgotEmail").value;
  const messageEle = document.getElementById("message");
  try{
    const res = await fetch( `${API_URL}/api/forgot-password`, {
      method: "POST",
      headers: {"Content-type": "application/json"},
      body: JSON.stringify({ email }),
    });
    const data = await res.json();

    //show success message for security
    messageEle.style.color = "green";
    messageEle.innerText = "If you have a registered account, an reset link has been sent to your email.";
  } catch(err){
    messageEle.style.color = "red";
    messageEle.innerText = "Error sending request. Please try again!";
  }
}
document.getElementById("changeDisplayButton").addEventListener("click", () => {

  if (!isDark) {
    document.querySelector("body").style.backgroundColor = "grey"
    document.getElementById("container").style.backgroundColor = "black"
    isDark = true;
    console.log("dark")
  }
  else {
    document.querySelector("body").style.backgroundColor = "white"
    document.getElementById("container").style.backgroundColor = "white"
    isDark = false;
    console.log("light")
  }

})
window.signup = signup;
window.login = login;
window.logout = logout;
window.requestPasswordReset = requestPasswordReset;
