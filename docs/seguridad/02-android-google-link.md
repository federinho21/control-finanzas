# Module 2 — Android anonymous account linking

Date: 2026-10-12.

## Outcome and acceptance status

The existing Android linking implementation was preserved and reinforced, not replaced. Code compilation, APK assembly and all 23 JVM tests pass. **Live Google linking is not yet validated:** local `google-services.json` has no OAuth client entries and generates no `default_web_client_id`. Android lint also reports an unrelated notification API compatibility error. This is not a completed production acceptance gate.

No Android installation, Firebase provider setting, account, payment, Firestore rule or collection was changed remotely. No module 3 work was started.

## Scope and assets

Android project: `C:/Users/Fede/WalletPaymentTracker` (not a Git repository in this environment).

Assets protected: the current Firebase UID, ownership of existing financial payments, Google ID token and independent Gmail authorization. The trust boundaries are the Google activity result, the current Firebase session before submission, Firebase's link response and the current session after completion.

The selected flow is **linkWithCredential**, never signInWithCredential/signOut/account deletion/payment reassignment. A collision with an existing Google account must fail rather than switch users. An ID is ownership context, not an authentication secret.

## File-by-file changes

Paths below are relative to `C:/Users/Fede/WalletPaymentTracker`:

| File | Change |
| --- | --- |
| `app/src/main/java/com/wallet/tracker/GoogleAccountLinker.kt` | Small testable linker; requires a nonempty token/expected UID, checks anonymous current identity before submission and unchanged UID/Google provider after completion |
| `app/src/main/java/com/wallet/tracker/FirebaseGoogleLinkSession.kt` | Firebase adapter; rechecks UID immediately before calling linkWithCredential; no sign-in, sign-out or data writes |
| `app/src/main/java/com/wallet/tracker/MainActivity.kt` | Retains Google linking UI/Gmail authorization; handles cancellation and launch failure; guards duplicate submission; saves pending UID, not tokens, across activity recreation; checks linker result before reporting success |
| `app/src/main/java/com/wallet/tracker/FirestoreRepository.kt` | Removes payment IDs/exception payloads from repository logs; payment path and UID assignment remain unchanged |
| `app/src/test/java/com/wallet/tracker/GoogleAccountLinkerTest.kt` | Twelve new unit tests for account-link security invariants |
| `README.md` | Firebase/OAuth setup and safe update/linking instructions |

The Google linking controls in `ui/PaymentListScreen.kt` already existed and were reused unchanged. The project already installed Play Services Auth/Firebase Auth/coroutine/JUnit dependencies; no new dependency or Gradle configuration was needed.

Documentation changes in Control Finanzas: this file and `docs/seguridad/README.md` only. Module 1 code remains unchanged.

## Guarantees and failure behavior

- Only the current anonymous Firebase user can begin linking; no account is logged out first.
- The expected UID is captured before launching Google. It is checked again before the credential is used.
- After Firebase succeeds, the returned user and current session must both have that same UID and a linked Google provider, and must no longer be anonymous.
- Missing session, changed UID, already-linked identity, blank token, incomplete provider response or mismatched current session fail closed.
- Google credential collision is shown without signing into the other account or merging/deleting records.
- Network/unknown errors say the link could not be confirmed; they do not falsely promise the server performed no change.
- A cancelled Google chooser never submits credentials.
- Duplicate taps/credential callbacks are guarded in Activity code; repeated completed links are rejected by the tested linker.
- During Google selection, pending UID is restored on activity recreation. If recreation interrupts credential submission, no token is persisted; the UI asks the user to inspect status before retrying rather than staying indefinitely busy. The already-submitted Firebase task may still complete remotely; device tests remain necessary.
- Gmail OAuth remains independent and unchanged.
- Firestore reads/writes stay in top-level `payments`, filtered/owned by the authenticated UID. There is no financial migration in this module.

## Verification performed

Initial Gradle attempt used installed Java 25 and failed before compilation. The existing Gradle/Android tooling works with JDK 17:

```powershell
cd C:\Users\Fede\WalletPaymentTracker
$env:JAVA_HOME='C:\Users\Fede\.jdks\ms-17.0.20'
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --console=plain
```

Results:

- `GoogleAccountLinkerTest`: **12 passed**.
- `PaymentNotificationParserTest`: **6 passed**.
- `WinkParserTest`: **5 passed**.
- Total: **23 tests, zero failures/errors/skips**.
- Kotlin compilation and debug APK assembly: **passed**.
- APK: `C:/Users/Fede/WalletPaymentTracker/app/build/outputs/apk/debug/app-debug.apk`.
- JUnit XML: `app/build/test-results/testDebugUnitTest/`.
- HTML test report: `app/build/reports/tests/testDebugUnitTest/index.html`.

The fake link-session tests cover unchanged UID, missing/changed session, non-anonymous/already-linked user, blank input, collision-like provider failure, incorrect result UID/provider, mismatched current identity, incomplete result, repeat link and coroutine cancellation. They do not call Firebase, Google or write payments. Actual Firebase collision mapping and lifecycle UI behavior require device acceptance.

An additional `:app:lintDebug` run **failed with 1 error and 12 warnings**:

```text
WalletNotificationListenerService.kt:92
getMessagesFromBundleArray requires API 30; app minSdk is 26.
```

That file was not modified in this module. No lint baseline, suppression or lower quality threshold was added. Existing GoogleSignIn deprecation warnings also remain: the already-installed implementation is reused rather than migrating the entire identity SDK here.

## Configuration blocker — user action required

The current local Android Firebase configuration contains zero OAuth web and Android clients. Do not fabricate a web client ID or substitute a Gmail access token for a Google ID token.

In the **same** Firebase project `wallet-payment-tracker-fede`:

1. Enable Google under Authentication > Sign-in method, configuring its support email if needed.
2. In Project settings > Android app `com.wallet.tracker`, register SHA-1 and SHA-256 for the signing certificate used by the installed APK. Inspect using:

   ```powershell
   $env:JAVA_HOME='C:\Users\Fede\.jdks\ms-17.0.20'
   .\gradlew.bat :app:signingReport
   ```

3. Download an updated `google-services.json` from that Android app and replace only the local `app/google-services.json`. It must include the appropriate web OAuth client so the Google Services plugin generates `default_web_client_id`.
4. Rebuild using the commands above. Credentials/private keys must not be pasted into this documentation or committed.

There are no new server secrets, Firestore migrations or Firestore rules to deploy for this module.

## Safe device acceptance procedure

1. Before web Google login, identify the existing anonymous user in Firebase Authentication and note its UID privately. Confirm that its existing `payments.userId` values match. The targeted UID is the one belonging to the current phone installation; the code does not hardcode a personal UID.
2. Record payment count/IDs/amounts before linking. No payment export should be added to source control or public logs.
3. Update the existing phone app using the **same package and signing key**. Do not uninstall, clear app storage, delete the anonymous user or sign it out. If installation fails with a signature mismatch, stop instead of uninstalling.
4. Open Movimientos > **Vincular cuenta de Google**, select the intended account and complete Google authorization.
5. In Firebase Authentication verify the **original UID** now lists Google. Check that existing payment IDs, amounts, ownership and count are unchanged (allow for genuinely new captures).
6. Restart Android and verify the linked status/preserved payments. Generate a test notification/payment and verify it is still stored under that same UID.
7. Verify cancelling the chooser changes nothing; repeat tapping does not start parallel linking. Rotate/recreate the Activity during chooser/submission and inspect actual final account status.
8. For collisions use disposable test users, not Fede's production identity. Verify the original anonymous session stays active and no records are reassigned. Do not resolve collisions by automatic account switching.
9. Verify Gmail connect/sync/disconnect still behaves independently.

If Google was already used to create a different Firebase UID, linking may collide. Stop and plan a separately approved account/data migration; this module deliberately does not merge users.

## Handoff

Implementation and automated tests are ready. Await OAuth configuration and device acceptance before declaring module 2 complete. Work stops here; module 3 has not begun. The unrelated lint issue must be addressed or explicitly triaged before any release.
