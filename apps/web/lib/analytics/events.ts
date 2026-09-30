"use client";

import { sendGAEvent } from "@next/third-parties/google";

function analyticsEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
}

export function trackSignUp(method = "email") {
  if (!analyticsEnabled()) return;

  sendGAEvent("event", "sign_up", {
    method,
  });
}

export function trackLogin(method = "email") {
  if (!analyticsEnabled()) return;

  sendGAEvent("event", "login", {
    method,
  });
}