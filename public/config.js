const isProduction = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";

export const API_URL = isProduction 
    ? "https://testertester-production.up.railway.app" 
    : "http://localhost:5000";