import dotenv from "dotenv";
dotenv.config();

import { User } from "./server.js";  // user schema 
import { Resend } from 'resend'; // for email
import { Recommendation } from "./server.js"; // recommednation schema 
const resendEmailKey = process.env.RESENDEMAILKEY
const resend = new Resend(resendEmailKey)

export async function weeklyEmail() {

    let allFailedUsersInfo = []

    try {


        let users = await User.find({ wantsEmail: true }, {}); // getting array of users that wants email


        for (const user of users) {
            try {
                const nameOfUser = user.name
                const emailOfUser = user.email
                const USERID = user._id.toHexString()

                console.log(`${nameOfUser} + ${emailOfUser} + ${USERID} `) // easy way to debug flow
                let recommendation = await Recommendation.findOne({ userId: USERID }, {})
                let recommendationsEmails = recommendation?.recommendations ?? [] // gives empty array if not found for better handling

                if (recommendationsEmails.length >= 3) { // making sure they have enough before email is sent

                    console.log("I have more than 3 emails")
                    console.log(recommendationsEmails[0])
                    console.log(recommendationsEmails[1])
                    console.log(recommendationsEmails[2])

                    await resend.emails.send({
                        from: 'inewsreader@mylinkly.work',
                        to: `${emailOfUser}`,
                        subject: 'Inews Reader -- weekly emails 🎉',
                        html: `Hey ${nameOfUser}, </br>
                        Here is a small list of some recommended articles to see more sign in  <br>
                        ${recommendationsEmails[0]} <br>
                        ${recommendationsEmails[1]} <br>
                        ${recommendationsEmails[2]} <br>
                        <a href="testertester-production.up.railway.app">See more!</a>
                        <a href="testertester-production.up.railway.app/cancel-weekly-emails">Cancel or Resubscribe to weekly email</a>


                                    `
                    });

                    console.log("email sent")
                }
                else {
                    console.log("does not have enough recommendations mails")
                }

            }
            catch (err) {
                allFailedUsersInfo.push({ name: user.name, email: user.email, reasonForFailure: err.message })
            }
            finally {
                console.log("MOVING TO NEXT USER....")
            }

        }

    }
    catch (err) {
        // if an error occurs here its most likely a db one
        console.log(err.message)
    }
    finally {

        console.log("SENDING FINAL EMAIL REPORT")



        await resend.emails.send({
            from: 'inewsreader@mylinkly.work',
            to: `eneojo.solomon.u@gmail.com`,
            subject: 'Inews Reader -- email Report',
            html: `Hey , </br>
                Here is a report of all failed articles
                ${JSON.stringify(allFailedUsersInfo, null, 2)}
              <a href="testertester-production.up.railway.app">See more!</a>
              `
        });
        console.log("SENT FINAL REPORT")



    }

}

//weeklyEmail()