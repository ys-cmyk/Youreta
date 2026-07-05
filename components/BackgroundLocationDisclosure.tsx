"use client";

// Google Play "prominent disclosure" for ACCESS_BACKGROUND_LOCATION: shown in
// the native Android/iOS shell BEFORE the OS permission prompt, the first time
// the user turns on live location sharing. Play policy requires the dialog to
// say the app collects location data, that collection continues when the app
// is closed or not in use, and to gate the feature on an explicit accept.
// See https://support.google.com/googleplay/android-developer/answer/9799150

export default function BackgroundLocationDisclosure({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bgloc-disclosure-title"
    >
      <div className="card w-full max-w-sm p-6">
        <h2 id="bgloc-disclosure-title" className="text-lg font-semibold">
          Share your location in the background?
        </h2>
        <p className="mt-3 text-sm opacity-80">
          Your ETA collects location data to share your live location and
          arrival time with the people in your destination — even when the app
          is closed or not in use, so sharing keeps working while your phone is
          in your pocket.
        </p>
        <p className="mt-2 text-sm opacity-80">
          Sharing stops when the timer you pick runs out or when you turn it
          off. Your location is only visible to participants of destinations
          you join.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" className="btn btn-primary min-h-12 w-full" onClick={onAccept}>
            Allow location sharing
          </button>
          <button type="button" className="btn btn-secondary min-h-12 w-full" onClick={onDecline}>
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
