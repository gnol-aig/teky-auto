// import express, { Router } from "express";
// import serverless from "serverless-http";

// const app = express();

// const router = Router();
// // middleware
// app.use(express.json());

// // routes
// router.get("/hello", (req, res) => {
//   res.json({ message: "Hello from Express on Netlify 🚀" });
// });

// router.post("/data", (req, res) => {
//   res.json({ received: req.body });
// });

// app.use('/api/', router)

// // export handler
// export const handler = serverless(app);


require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const axios = require('axios');
const app = express();
const cors = require('cors');
const serverless = require('serverless-http');
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173', 
  credentials: true                  
}));
const router = express.Router()

// Helper to check if today is a weekday (Mon-Fri)
// JS getDay(): 0 = Sun, 1 = Mon ... 5 = Fri, 6 = Sat
const isTodayWeekday = () => {
    const day = new Date().getDay();
    return day >= 1 && day <= 5;
};

// Helper to get today's date in dd-mm-yyyy format
const getTodayDateString = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
};

// Helper to get current time in minutes (HH*60 + MM)
const getCurrentTimeInMinutes = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
};

router.get('/trigger-attendance', async (req, res) => {
    const url = "https://erp.teky.edu.vn/web/dataset/call_kw/hr.employee/attendance_manual";

    // Logic for Reason
    const reason = isTodayWeekday() ? "Checkin trường ngoài" : "Checkin cơ sở tân bình";

    // Time Logic (5 PM check)
    const currentHour = new Date().getHours();
    const isCheckin = currentHour < 17;

    // Build Payload
    const payload = {
        jsonrpc: "2.0",
        method: "call",
        params: {
            args: [
                [8466], // Your ID
                "hr_attendance.hr_attendance_action_my_attendances"
            ],
            model: "hr.employee",
            method: isCheckin ? "my_attendance_manual" : "attendance_manual",
            kwargs: {}
        },
        id: Math.floor(Math.random() * 900000000) + 100000000
    };

    // If it's a check-in, the API expects the extra 'reason' arguments
    if (isCheckin) {
        payload.params.args.push("Đi làm việc ở bên ngoài", reason);
    }

    try {
        const response = await axios.post(url, payload, {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0",
                "Cookie": `session_id=${process.env.SESSION_ID}`
            }
        });

        console.log(`Action: ${isCheckin ? 'Checkin' : 'Checkout'} at ${new Date().toISOString()}`);
        res.status(200).json({
            success: true,
            message: isCheckin ? "Checkin Successful" : "Checkout Successful",
            data: response.data
        });

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/checkin-auto', async (req, res) => {
    const today = getTodayDateString();
    const currentTimeMinutes = getCurrentTimeInMinutes();
    const bearerToken = process.env.BEARER_TOKEN || '';

    try {
        // Step 1: Get all sessions for today
        const sessionsResponse = await axios.get(
            `https://api.tutoro.vn/v1/class_sessions?from_date=${today}&to_date=${today}`,
            {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            }
        );

        const sessions = sessionsResponse.data.data.list_sessions || [];
        const checkinResults = [];

        console.log(`Found ${sessions.length} sessions for today (${today}). Current time: ${currentTimeMinutes} minutes`);

        // Step 2: Process each session
        for (const session of sessions) {
            const sessionStartTime = session.datetime.start_time;
            const sessionEndTime = session.datetime.end_time;

            // Step 3: Compare current time with session start time
            if (currentTimeMinutes >= sessionStartTime && currentTimeMinutes < sessionEndTime) {
                try {
                    // Step 4: Call check-in API
                    const checkinResponse = await axios.post(
                        `https://api.tutoro.vn/v1/class_sessions/${session.session_id}/checkin`,
                        {},
                        {
                            headers: {
                                'Authorization': `Bearer ${bearerToken}`
                            }
                        }
                    );

                    checkinResults.push({
                        session_id: session.session_id,
                        class_name: session.class_name,
                        class_code: session.class_code,
                        start_time: sessionStartTime,
                        end_time: sessionEndTime,
                        status: 'success',
                        message: checkinResponse.data.message
                    });

                    console.log(`✓ Checked in to session ${session.session_id} (${session.class_name}) at ${new Date().toISOString()}`);
                } catch (checkinError) {
                    checkinResults.push({
                        session_id: session.session_id,
                        class_name: session.class_name,
                        class_code: session.class_code,
                        start_time: sessionStartTime,
                        end_time: sessionEndTime,
                        status: 'error',
                        error: checkinError.response?.data || checkinError.message
                    });

                    console.error(`✗ Check-in failed for session ${session.session_id}:`, checkinError.message);
                }
            } else {
                checkinResults.push({
                    session_id: session.session_id,
                    class_name: session.class_name,
                    class_code: session.class_code,
                    start_time: sessionStartTime,
                    end_time: sessionEndTime,
                    status: 'skipped',
                    reason: `Current time (${currentTimeMinutes}) < Session start time (${sessionStartTime})`
                });

                console.log(`⊘ Skipped session ${session.session_id} - not started yet`);
            }
        }

        res.status(200).json({
            success: true,
            current_time_minutes: currentTimeMinutes,
            current_time_formatted: new Date().toLocaleTimeString('en-GB'),
            today: today,
            total_sessions: sessions.length,
            checkin_results: checkinResults
        });

    } catch (error) {
        console.error('Check-in auto API error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/login', async (req, res) => {
    let { mobile_number, password } = req.body;
    
    if (!mobile_number || !password) {
        return res.status(400).json({
            success: false,
            error: 'mobile_number and password are required'
        });
    }

    const deviceID = crypto.randomUUID();

    if (mobile_number[0] == '0') {
        mobile_number = mobile_number.replace('0', '+84');
    }

    try {
        const loginResponse = await axios.post(
            'https://api.tutoro.vn/v1/user/login_pass',
            {
                "mobile_number": mobile_number,
                "password": password,
                "device_id": deviceID,
                "firebase_token": process.env.FIREBASE_TOKEN
            }
        );

        // Success response - check if login succeeded
        if (loginResponse.data.message.status === 'Fail') {
            return res.status(loginResponse.data.message.status_code || 400).json({
                success: false,
                message: loginResponse.data.message.text,
                errors: loginResponse.data.error
            });
        }

        res.status(200).json({
            success: true,
            data: loginResponse.data
        });
        

    } catch (error) {
        // Handle API error responses
        if (error.response?.data?.message?.status === 'Fail') {
            return res.status(error.response.data.message.status_code || 400).json({
                success: false,
                message: error.response.data.message.text,
                errors: error.response.data.error
            });
        }

        // Handle other errors
        console.error('login API error:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.message
        });
    }   
});

router.post('/class-sessions/:session_id/checkin', async (req, res) => {
    const session_id = req.params.session_id
    const bearerToken = process.env.BEARER_TOKEN || '';

    try {
        const checkinResponse = await axios.post(
            `https://api.tutoro.vn/v1/class_sessions/${session_id}/checkin`,
            {}
            ,{
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            }
        )

        if (checkinResponse.status == 200) {
            res.json({
                success: true,
                session: session_id,
                data: checkinResponse.data
            })
        } else {
            console.error(checkinResponse.data)
        }
    } catch (error) {
        console.error('Check-in API error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
})

router.post('/class-sessions/:session_id/set-total-students', async (req, res) => {
    const session_id = req.params.session_id
    const { total_students } = req.body
    const bearerToken = process.env.BEARER_TOKEN || '';

    if (!total_students || typeof total_students !== 'number') {
        return res.status(400).json({
            success: false,
            error: 'total_students is required and must be a number'
        });
    }

    try {
        const setTotalStudentResponse = await axios.post(
            `https://api.tutoro.vn/v1/class_sessions/${session_id}/total_student`,
            {
                'total_students': total_students
            },
            {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                },
            }
        )

        res.json({
            success: true,
            data: setTotalStudentResponse.data
        })
    } catch (error) {
        console.error('Set total students API error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
})

app.use('/api/', router)

export const handler = serverless(app);