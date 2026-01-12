// const deployedLink = "https://testertester-production.up.railway.app"
// const localLink = "http://localhost:5000";
import { API_URL } from "./config.js";
async function submitNewPassword(){
    const newPass = document.getElementById("newPassword");
    const confirmPass = document.getElementById("confirmPassword");
    const messageEle = document.getElementById("message");

    const newPassword = newPass.value.trim();
    const confirmPassword = confirmPass.value.trim();

    //DEBUG
    console.log("--- DEBUG PASSWORD CHECK ---");
    console.log(`Password 1: "${newPassword}"`);
    console.log(`Password 2: "${confirmPassword}"`);
    console.log(`Match? ${newPassword === confirmPassword}`);

    //Client-side validation

    //check if new password and confirmed one matched
    if (newPassword != confirmPassword){
        messageEle.style.color = "red";
        messageEle.innerText = "Password do not match";
        return;
    }

    //get token from url
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");

    if (!token){
        messageEle.style.color = "red";
        messageEle.innerText = "Error: Missing reset token. Please use the link from your email.";
        return;
    }

    //send to backend
    try{
        const res = await fetch(`${API_URL}/api/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: token,
                password: newPassword
            }),
        });
        
        const data = await res.json();
        if (res.ok){
            //Success
            messageEle.style.color = "green";
            messageEle.innerText = "Success! Your password has been reset.";

            //disable inputs so they can't be submitted again
            newPass.disabled = true;
            confirmPass.disabled = true;

            //redirect to login page after 2 seconds
            setTimeout(() => {
                window.location.href = "login.html";
            }, 2000);

        } else {
            //SERVER error
            messageEle.style.color = "red";
            messageEle.innerText = data.message || "Failed to reset password.";
        }
    } catch (err) {
        //Network error
        console.error("Reset error: ", err);
        messageEle.style.color = "red";
        messageEle.innerText = "Server error. Please try again later.";
    }
}
window.submitNewPassword = submitNewPassword;