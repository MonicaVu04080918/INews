// const deployedLink = "https://testertester-production.up.railway.app"
// const localLink = "http://localhost:5000";
import { API_URL } from "./config.js";
document.addEventListener('DOMContentLoaded', function () {
    setupHomepageAuth();
    loadQuickSearchTerms();
    // const testButton = document.getElementById("test-button")
    //const quickSearches = document.getElementsByClassName("quickSearch")

    if (document.getElementById("searchBar")) {
        const searchBar = document.getElementById("searchBar");
        const userInput = document.getElementById("userInput");

        searchBar.addEventListener("submit", (e) => {
            e.preventDefault();

            const query = userInput.value.trim();
            if (query) {
                console.log("User searched for:", query); //to verify input
                //localStorage.setItem("searchTerm", query);
                window.location.href = `results.html?query=${encodeURIComponent(query)}`;
            }
        }
        );
    }
    // let isDark = false;
    // const displayButton = document.getElementById("changeDisplayButton")
    // if (displayButton){
    //     displayButton.addEventListener("click", () => {
    //         const container = document.getElementById("container") || document.body;
    //         if (!isDark) {
    //             container.style.backgroundColor = "grey"
    //             isDark = true;
    //         }
    //         else {
    //             container.style.backgroundColor = "white"
    //             isDark = false;
    //         }
    //     });
    // }
});

async function loadQuickSearchTerms(){
  const container = document.getElementById("quickSearchContainer");
  if (!container) return;
  const token = localStorage.getItem("token");
  //default terms if user is not logged in
  let terms = ["Technology", "Science", "Health", "World", "Business"];

  if (token){
    try{
      const res = await fetch(`${API_URL}/api/user/suggestions`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok){
        terms = await res.json();
      }
    } catch (err){
      console.error("Failed to load personalized terms", err);
    }
  }

  //render terms
  container.innerHTML = "";
  terms.forEach(term => {
    const tag = document.createElement("h3");
    tag.textContent = term;
    tag.classList.add("quickSearch");

    tag.addEventListener("click", () => {
        console.log("You clicked personalized term: " + term);
        window.location.href = `results.html?query=${encodeURIComponent(term)}`;
    });
    container.appendChild(tag);
  });
}
function setupHomepageAuth() {
    const loginBtn = document.getElementById("loginNavButton");
  //const signupBtn = document.getElementById("signupNavButton");
  const logoutBtn = document.getElementById("logoutButton");
  const userGreeting = document.getElementById("userGreeting");
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username");
  if (token && username) {
    // User is logged in, show logout button and greeting
    console.log("Logged in as:", username);
    if (userGreeting) {
      //set personalized greeting
      userGreeting.textContent = `Hello, ${username}!`;
      userGreeting.classList.remove("hidden");
    }
    //show/hide logout button
    if (logoutBtn) {
      loginBtn.classList.add("hidden");
      logoutBtn.classList.remove("hidden");
      //attach logout click event
      logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        alert("You have been logged out.");
        window.location.href = "index.html";
      });
    }
  } else {
    if (userGreeting) userGreeting.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (loginBtn) loginBtn.classList.remove("hidden");
    //return;
  }
}