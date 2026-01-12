document.addEventListener("DOMContentLoaded", () => {
const expandButton = document.getElementById("expand-forecast")
const forecastContainer = document.getElementById("forecast-container")
if (expandButton && forecastContainer){
  expandButton.addEventListener("click", () =>{
      if(forecastContainer.style.display == "none"){
          forecastContainer.style.display = "flex";
          expandButton.textContent = "▶";
      } else {
          forecastContainer.style.display = "none";
          expandButton.textContent = "◀";
      }
  }
  );
}

//Weather bar API call
async function fetchWeather(latitude, longitude) {
  try {
    const pointRes = await fetch(`https://api.weather.gov/points/${latitude},${longitude}`);
    if (!pointRes.ok){
      throw new Error("Failed to fetch point data");
    }
    const pointData = await pointRes.json();
    if (!pointData.properties?.forecast){
      throw new Error("Forecast URL missing");
    }
    const foreCastUrl = pointData.properties.forecast;
    const forecastRes = await fetch(foreCastUrl);
    if (!forecastRes.ok) throw new Error("Failed to fetch forecast data");
    
    const forecastData = await forecastRes.json();
    const periods = forecastData.properties.periods;

    const now = new Date();
            
    // Find the period where "Now" is between Start and End time
    let current = periods.find(period => {
        const start = new Date(period.startTime);
        const end = new Date(period.endTime);
        return now >= start && now < end;
    });

    // Fallback: If we can't find a match (rare), just use the first one
    if (!current) current = periods[0];
    
    const tempEl = document.getElementById("temperature");
    const cityEl = document.getElementById("city");
    const condEl = document.getElementById("condition");
    const iconEl = document.getElementById("weather-icon");

    if(tempEl) tempEl.textContent = `${current.temperature}°${current.temperatureUnit}`;
    if(cityEl) cityEl.textContent = pointData.properties.relativeLocation.properties.city;
    if(condEl) condEl.textContent = current.shortForecast;
    if(iconEl) {
        iconEl.src = current.icon;
        iconEl.alt = current.shortForecast;
    }

    // We group periods by Date to find the High/Low for every day dynamically
    const dailyForecasts = {};

    periods.forEach(period => {
        const dateObj = new Date(period.startTime);
        // Create a simple date key like "Mon Oct 25 2025"
        const dateKey = dateObj.toDateString(); 

        if (!dailyForecasts[dateKey]) {
            dailyForecasts[dateKey] = {
                dayName: dateKey.split(" ")[0], // e.g., "Mon"
                temps: [],
                icon: period.icon, // Default icon
                isDaytimeFound: false
            };
        }

        // Collect all temps for this date (Day + Night)
        dailyForecasts[dateKey].temps.push(period.temperature);

        // If we find a daytime period, use that icon (it's usually better for the summary)
        // If it's night, we keep the night icon we set initially
        if (period.isDaytime) {
            dailyForecasts[dateKey].icon = period.icon;
            dailyForecasts[dateKey].isDaytimeFound = true;
        }
    });
    if (forecastContainer) {
        forecastContainer.innerHTML = ""; 
        //for dark/light mode feature
        const isDarkMode = localStorage.getItem("theme") === "dark";
                
        // Convert object to array and take the first 4 days
        const daysToDisplay = Object.values(dailyForecasts).slice(0, 4);

        daysToDisplay.forEach(day => {
            const dayDiv = document.createElement("div");
            dayDiv.classList.add("forecast-day");

            // Calculate High/Low from the collected temps
            const maxTemp = Math.max(...day.temps);
            const minTemp = Math.min(...day.temps);
            
            // Logic: If we only have one temp (e.g. it's night time), 
            // max and min are same. Show just one number.
            let tempString = `${maxTemp}°/${minTemp}°`;
            if (maxTemp === minTemp) {
                tempString = `${maxTemp}°`;
            }

            const dayName = document.createElement("p");
            dayName.textContent = day.dayName;

            const icon = document.createElement("img");
            icon.src = day.icon;
            //icon.alt = period.shortForecast;
            icon.classList.add("forecast-icon");  

            const temperature = document.createElement("p");
            temperature.textContent =  tempString;
            temperature.classList.add("forecast-temp");

            if (isDarkMode) {
                dayName.style.color = "#f0f0f0";
                temperature.style.color = "#f0f0f0";
            } else {
                dayName.style.color = "#333";
                temperature.style.color = "#333";
            }

            dayDiv.appendChild(dayName);
            dayDiv.appendChild(icon);
            dayDiv.appendChild(temperature);

            forecastContainer.appendChild(dayDiv);
        });
        if (isDarkMode) {
            forecastContainer.style.backgroundColor = "#2d3748";
        } else {
            forecastContainer.style.backgroundColor = "white";
        }
    }
  } catch (err) {
    console.error("Weather fetch failed:", err);
  }
}
//Get user's location and call fetchWeather() on the collected lat and lon
//Asking for user's permission will be automatically poped up by the browser
window.addEventListener("load", () => {
  const city = document.getElementById("city");
  const condition = document.getElementById("condition");
  if (! navigator.geolocation){
    if (city){
      city.textContent= "Location not supported";
    }
    if (condition){
      condition.textContent= "Weather unavailable";
    }
    return;
  }
  navigator.geolocation.getCurrentPosition(
      (position) =>{
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        fetchWeather(latitude, longitude);
      },
      (error) => {
        console.warn("User denied location access:", error);
        if (city){
          city.textContent= "Location not supported";
        }
        if (condition){
          condition.textContent= "Weather unavailable";
        }
      }
  );  
});
});
