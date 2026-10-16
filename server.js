const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Load service account from environment variable
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
  console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', e);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Chatly Call Backend' });
});

// Send incoming call notification
app.post('/send-call', async (req, res) => {
  try {
    const { receiverId, callerId, callerName, callType, callId } = req.body;

    if (!receiverId || !callId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get receiver's FCM token
    const userDoc = await admin
      .firestore()
      .collection('users')
      .doc(receiverId)
      .get();
    const fcmToken = userDoc.data()?.fcmToken;

    if (!fcmToken) {
      return res.status(404).json({ error: 'No FCM token found for receiver' });
    }

    // High-priority data message
    const message = {
      token: fcmToken,
      data: {
        type: 'incoming_call',
        callId: String(callId),
        callerId: String(callerId),
        callerName: String(callerName),
        callType: String(callType),
      },
      android: {
        priority: 'high',
        ttl: 30000,
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            alert: {
              title: 'Incoming Call',
              body: `${callerName} is calling...`,
            },
            sound: 'default',
            'content-available': 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log('Notification sent:', response);
    res.json({ success: true, messageId: response });
  } catch (error) {
    console.error('Send call error:', error);
    res.status(500).json({ error: error.message });
  }
});

// End call notification
app.post('/end-call', async (req, res) => {
  try {
    const { receiverId, callId } = req.body;

    const userDoc = await admin
      .firestore()
      .collection('users')
      .doc(receiverId)
      .get();
    const fcmToken = userDoc.data()?.fcmToken;

    if (!fcmToken) {
      return res.status(404).json({ error: 'No FCM token' });
    }

    await admin.messaging().send({
      token: fcmToken,
      data: {
        type: 'call_ended',
        callId: String(callId),
      },
      android: { priority: 'high' },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
