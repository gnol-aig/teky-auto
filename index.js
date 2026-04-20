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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));