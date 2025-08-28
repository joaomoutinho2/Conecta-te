import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

export const markQueueMatched = functions.https.onCall(async (data) => {
  const uid = data.uid as string;
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'uid is required');
  }

  await admin.firestore().collection('match_queue').doc(uid).update({
    status: 'matched',
    ts: admin.firestore.FieldValue.serverTimestamp(),
  });
});
