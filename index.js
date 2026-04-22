require('dotenv').config();

const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

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

app.get('/trigger-attendance', async (req, res) => {
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

app.post('/checkin-auto', async (req, res) => {
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
            if (currentTimeMinutes >= sessionStartTime) {
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));