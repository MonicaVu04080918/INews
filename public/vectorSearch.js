//const localLink = "http://localhost:5000";
// let me know if I need to put all of the sources in here
// watch various videos and read articles on how to do vector search implementation
//const API_BASE = localLink;
import { API_URL } from "./config.js";
//the plan is to use hugging faces free tier and if we choose we cna switch to open ais later
// no open ai :)
//probably should have changed the file name but it is 👍 
export async function search(query, limit = 10) {
  try {
    const response = await fetch(`${API_URL}/api/search?query=${encodeURIComponent(query)}&limit=${limit}`);

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const data = await response.json();
    return data; 
  } catch (error) {
    console.error("Search error:", error);
    throw error;
  }
}
export async function vectorSearch(query, limit = 10) {
  const response = await fetch(`${API_URL}/api/articles/hybrid-search`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ query, limit })
  });
  if (response.status === 401) {
      console.warn("Token expired during vector search. Logging out...");
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      window.location.reload(); // Refresh to reset to Guest Mode
      return [];
    }
    if (!response.ok) {
      throw new Error(`Vector search failed: ${response.status}`);
    }

  const data = await response.json();
  return data.results || [];
}

