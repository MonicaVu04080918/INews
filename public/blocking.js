import { API_URL } from "./config.js";


export async function loadBlockedItems() {
    const formContainer = document.getElementById("blockingForm");
    const msgContainer = document.getElementById("blockingLoginMsg");
    try {
        const token = localStorage.getItem('token');
        if (!token) {
                // Hide the inputs
            if (formContainer) formContainer.style.display = "none";
            
            // Show the login message
            if (msgContainer) {
                msgContainer.style.display = "block";
                msgContainer.innerHTML = `
                    <p style="text-align: center; color: #4b5563; padding: 10px;">
                        To manage your blocked content, please 
                        <a href="login.html" style="color: #6BBBFF; font-weight: bold; text-decoration: underline;">
                            log in or sign up
                        </a>.
                    </p>
                `;
            }
            console.log('No token found, showing login message.');
            return; // Stop here
        }

        // User IS logged in
        // Ensure form is visible and message is hidden (resets UI if user just logged in)
        if (formContainer) formContainer.style.display = "block";
        if (msgContainer) msgContainer.style.display = "none";

        const response = await fetch(`${API_URL}/api/blocks`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayTopics(data.blockedTopics || []);
            displaySources(data.blockedSources || []);
        }
    } catch (error) {
        console.error('Failed to load blocked items:', error);
    }
}

export async function blockTopic() {
    const input = document.getElementById('topicInput');
    const topic = input.value.trim();
    
    if (!topic) {
        showMessage('topicMessage', 'Please enter a topic', 'error');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/blocks/topic`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ topic })
        });

        const data = await response.json();
        
        if (response.ok) {
            showMessage('topicMessage', 'Topic blocked successfully!', 'success');
            input.value = '';
            displayTopics(data.blockedTopics);
        } else {
            showMessage('topicMessage', data.error || 'Failed to block topic', 'error');
        }
    } catch (error) {
        showMessage('topicMessage', 'Error connecting to server', 'error');
    }
}

export async function blockSource() {
    const input = document.getElementById('sourceInput');
    const source = input.value.trim();
    
    if (!source) {
        showMessage('sourceMessage', 'Please enter a source', 'error');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/blocks/source`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ source })
        });

        const data = await response.json();
        
        if (response.ok) {
            showMessage('sourceMessage', 'Source blocked successfully!', 'success');
            input.value = '';
            displaySources(data.blockedSources);
        } else {
            showMessage('sourceMessage', data.error || 'Failed to block source', 'error');
        }
    } catch (error) {
        showMessage('sourceMessage', 'Error connecting to server', 'error');
    }
}

export async function unblockTopic(topic) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/blocks/topic/${encodeURIComponent(topic)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        
        if (response.ok) {
            showMessage('topicMessage', 'Topic unblocked!', 'success');
            displayTopics(data.blockedTopics);
        }
    } catch (error) {
        showMessage('topicMessage', 'Error connecting to server', 'error');
    }
}

export async function unblockSource(source) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/blocks/source/${encodeURIComponent(source)}`, {
          	method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        
        if (response.ok) {
            showMessage('sourceMessage', 'Source unblocked!', 'success');
            displaySources(data.blockedSources);
        }
    } catch (error) {
        showMessage('sourceMessage', 'Error connecting to server', 'error');
    }
}

function displayTopics(topics) {
    console.log("Displaying Topics:", topics); //debug
    const list = document.getElementById('topicsList');
    list.innerHTML = topics.length === 0 
        ? '<p>No blocked topics</p>' 
        : topics.map(topic => `
            <div class="list-item">
                <span>${topic}</span>
                <button class="remove-btn" onclick="unblockTopic('${topic}')">Remove</button>
            </div>
        `).join('');
}

function displaySources(sources) {
    const list = document.getElementById('sourcesList');
    list.innerHTML = sources.length === 0 
        ? '<p>No blocked sources</p>' 
        : sources.map(source => `
            <div class="list-item">
                <span>${source}</span>
                <button class="remove-btn" onclick="unblockSource('${source}')">Remove</button>
            </div>
        `).join('');
}

function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = 'block';
    
    setTimeout(() => {
        element.style.display = 'none';
    }, 3000);
}

