// const deployedLink = "https://testertester-production.up.railway.app"
// const localLink = "http://localhost:5000"
import { API_URL } from "./config.js";
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("onboardingForm");
  const errorText = document.getElementById("errorText");

  /*const email = localStorage.getItem("loggedInUser");
  if (!email) {
    window.location.href = "login.html";
    return;
  }*/
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }
  /*
  try {
    const checkRes = await fetch("http://localhost:5001/api/users/status", { // use http://localhost:5000 in dev and ensure that the port number matches your env)
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
  });
  if (!checkRes.ok) {
    throw new Error("Failed to check user status");
  }
  const statusData = await checkRes.json();

  if (statusData.onboardingCompleted) {
    windown.location.href = "index.html";
    return;
  }
  // Check if this user has already completed onboarding
  const onboardingKey = `${email}_hasCompletedOnboarding`;
  if (localStorage.getItem(onboardingKey)) {
    window.location.href = "index.html";
    return;
  }*/
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const age = document.getElementById("age").value.trim();
    const comments = document.getElementById("comments").value.trim();

    const selectedTopics = Array.from(
      document.querySelectorAll("input[name='topics']:checked")
    ).map((checkbox) => checkbox.value);

    const nameRegex = /^[A-Za-z ]+$/; //Learned This in my System Programming Class
    if (!name.match(nameRegex)) {
      showError("Please enter a valid name (letters and spaces only).");
      return;
    }

    if (isNaN(age) || age < 1 || age > 125) {
      showError("Please enter a valid age between 1 and 125.");
      return;
    }

    if (selectedTopics.length === 0) {
      showError("Please select at least one topic of interest.");
      return;
    }
    const userProfile = {
      name,
      age,
      topics: selectedTopics,
      comments,
    };
    fetch(`${API_URL}/api/onboarding`, { 
      method: "POST",
      //I have never user Local Storage before, so this took a while for me to figure out! Had to watch a few youtube vidoes on this
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(userProfile) //remove email, based on token instead
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          //localStorage.setItem(onboardingKey, "true");

          showSuccess(`Thanks, ${name}! Redirecting to your personalized feed...`);
          setTimeout(() => {
            window.location.href = "index.html";
          }, 1500);
        } else {
          showError("Failed to save profile. Please try again.");
        }
      })
      .catch(() => {
        showError("Could not connect to the server.");
      });
  });
  /*} catch (error) {
    console.error("Initial boarding check failed:", error);
    showError("Could not verify user's status. Please login again.");
    return;
  }*/

  function showError(message) {
    errorText.textContent = message;
    errorText.className = "errorText";
  }

  function showSuccess(message) {
    errorText.textContent = message;
    errorText.className = "successText";
  }
});
