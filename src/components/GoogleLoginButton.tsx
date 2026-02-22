import React from "react";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";

export interface GoogleUser {
  googleId: string;
  email: string;
  name: string;
  picture: string;
  emailVerified: boolean;
}

interface GoogleJwtPayload {
  sub: string;
  email: string;
  name: string;
  picture: string;
  email_verified: boolean;
}

interface GoogleLoginButtonProps {
  onSuccess: (user: GoogleUser) => void;
  onError?: () => void;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

const GoogleLoginButtonInner: React.FC<GoogleLoginButtonProps> = ({ onSuccess, onError }) => {
  const handleSuccess = (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      onError?.();
      return;
    }

    try {
      const payload = jwtDecode<GoogleJwtPayload>(credentialResponse.credential);
      onSuccess({
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        emailVerified: payload.email_verified,
      });
    } catch (err) {
      console.error("[GoogleLogin] Failed to decode token:", err);
      onError?.();
    }
  };

  return (
    <GoogleLogin
      onSuccess={handleSuccess}
      onError={onError}
      useOneTap={false}
      theme="outline"
      size="large"
      shape="rectangular"
      text="signin_with"
      logo_alignment="left"
    />
  );
};

const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = (props) => {
  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="text-xs text-muted-foreground border border-dashed border-border rounded-xl px-4 py-2 text-center">
        Google OAuth not configured — add <code>VITE_GOOGLE_CLIENT_ID</code> to <code>.env</code>
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <GoogleLoginButtonInner {...props} />
    </GoogleOAuthProvider>
  );
};

export default GoogleLoginButton;
