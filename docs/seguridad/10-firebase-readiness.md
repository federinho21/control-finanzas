# Firebase readiness — real project inspection and local configuration

## Project and source of truth

Fede identified `C:\Users\Fede\WalletPaymentTracker` as the Android app and Firebase configuration source. The Firebase MCP environment also points at this directory and project `wallet-payment-tracker-fede`. Its `firebase.json`, rules, indexes and `FirestoreRepository.kt` were reviewed alongside the remote metadata. No remote configuration or data was changed.

Android still writes `payments/{id}` with `userId` taken from its authenticated Firebase account. The web repository reads that same source by verified UID. Existing captured payments do not need to be copied into a different collection merely to appear on the web.

Important deployment distinction: the MCP directory is the Android project, NOT `base-agent`. Do not use a generic MCP deploy assuming it will publish the web's proposed rules/indexes/hosting configuration. Confirm the exact project AND directory before any authorized deployment.

## Remote checks

Read-only inspection found:

- Firebase project active; billing reported disabled.
- Android app `com.wallet.tracker` registered and active.
- A Web app already exists: `Default Web App`, ID `1:92220264352:web:3af5754f5d313900bedec5`. No duplicate Web app was created. This supersedes the earlier assumption that Web registration was missing.
- Remote Android SDK config now contains OAuth Android and Web clients; the old local JSON did not. OAuth client presence is not a complete live Google-login acceptance test.
- Existing UID `MOjsiAMSkAZGtBwqzvvpJELHrjj2` exists. The initial Auth lookup returned no linked provider data. After Fede installed the updated APK, a new read-only lookup confirmed `providerUserInfo.providerId = google.com` and a verified email on the SAME UID. Google identity linking is now verified remotely. The agent did not create, disable, sign out, delete or reassign any user.
- Firestore `(default)` is Native/Standard in `nam5`; PITR and deletion protection reported disabled. No paid backup or protection change was enabled automatically.
- The source `payments` index `userId ASC + timestamp DESC` is READY. The other web-required composite indexes were not listed; they remain pending deployment/readiness checks.
- Remote Firestore rules match the Android project's owner-scoped payments rules. Proposed web hardening rules have NOT replaced them.

Storage bucket name is present in SDK metadata: `wallet-payment-tracker-fede.firebasestorage.app`. This is not proof that the bucket is provisioned, that IAM is correct or that Storage access succeeds.

## Local changes

- Added the verified Web SDK public configuration, project ID, bucket name and local `AUTH_ORIGIN=http://localhost:3000` to `base-agent/.env`. The pre-existing Gemini setting was preserved. `.env` is Git-ignored. No Admin private key was added.
- Refreshed only the OAuth client fields in `C:\Users\Fede\WalletPaymentTracker\app\google-services.json` from the remote SDK config. Existing package, Firebase app ID and API key were preserved. No identity/application reset occurred.
- Android Google Services now generates the missing `default_web_client_id` resource.

Local Windows checks found no `gcloud` CLI, ADC file or `GOOGLE_APPLICATION_CREDENTIALS` environment setting. Firebase MCP/CLI login is not a substitute for the Application Default Credentials used by the web's Firebase Admin SDK. The local authenticated backend still needs real credentials/IAM; no fake-auth bypass was added.

## Android verification

The default Java executable is JDK 25, incompatible with this project's Gradle 8.2/Kotlin tooling. The first build failed. Retried using the already installed JDK 17 for this command only, without changing system Java settings:

```powershell
$env:JAVA_HOME = 'C:\Users\Fede\.jdks\ms-17.0.20'
.\gradlew.bat :app:signingReport :app:testDebugUnitTest :app:assembleDebug
```

Build passed. Unit results: **23 tests, 0 failures/errors/skips** (12 Google linking, 6 notification parsing, 5 WINK parsing).

Debug SHA-1 matches the registered remote OAuth certificate:

```text
7B:09:52:B7:04:49:C0:37:89:D7:59:91:1E:08:F0:6D:FC:E7:AF:44
```

Updated APK:

```text
C:\Users\Fede\WalletPaymentTracker\app\build\outputs\apk\debug\app-debug.apk
```

Fede subsequently reported installing the APK; the agent's read-only Auth check confirmed Google linking on the original UID. The agent did not install the APK or manipulate the phone account. Fresh Android payment capture and real Web login still need acceptance checks.

## Required next human steps

1. **Completed:** Fede installed the updated APK.
2. **Completed:** Google provider is linked to the original Android UID; no payment reassignment is needed.
3. **Completed:** the agent rechecked the original UID remotely. Web Google-login acceptance can now proceed once the backend has real credentials.
4. Hosting decision updated: Fede selected [Netlify Functions](11-netlify-hosting.md), so Blaze is no longer a requirement for hosting. Decide separately whether to retain Cloud Storage with Blaze or authorize another private document store; no billing action was taken.
5. Configure ADC locally (or runtime service-account identity in staging) and required IAM. Do not send service-account private keys or OAuth tokens in chat. Confirm Google provider enabled and authorized domains in the Firebase console; a real login is still unverified.
6. Before deployment, review the two critical DevTools advisories and other reachable high findings, publish only explicitly approved rules/indexes/TTL, then perform staged two-user acceptance. SQL/D1 reconciliation/import is separate from existing Android Firestore payments.

App Hosting and Storage billing references:

- https://firebase.google.com/docs/app-hosting/get-started
- https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024

No remote migration, deployment, billing/IAM change, rule publication, Firebase app creation, Android account switch or payment write was performed.
