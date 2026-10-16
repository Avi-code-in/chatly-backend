const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let serviceAccount;
try {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!base64) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 not set');
  const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
  serviceAccount = JSON.parse(jsonStr);
  console.log('SUCCESS: Service account loaded for:', serviceAccount.project_id);
} catch (e) {
  console.error('ERROR: Service account error:', e.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Chatly Call Backend' });
});

app.post('/send-call', async (req, res) => {
  try {
    const { receiverId, callerId, callerName, callType, callId } = req.body;
    if (!receiverId || !callId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const userDoc = await admin.firestore().collection('users').doc(receiverId).get();
    const fcmToken = userDoc.data()?.fcmToken;
    if (!fcmToken) {
      return res.status(404).json({ error: 'No FCM token found' });
    }

    const message = {
      token: fcmToken,
      data: {
        type: 'incoming_call',
        callId: String(callId),
        callerId: String(callerId),
        callerName: String(callerName),
        callType: String(callType),
      },
      android: { priority: 'high', ttl: 30000 },
    };

    const response = await admin.messaging().send(message);
    console.log('Notification sent:', response);
    res.json({ success: true, messageId: response });
  } catch (error) {
    console.error('Send call error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
