import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UserRole } from "../constants/roles";

/*
|--------------------------------------------------------------------------
| JWT Payload
|--------------------------------------------------------------------------
*/
interface AccessTokenPayload {
  userId: string;
  role: UserRole;
}

/*
|--------------------------------------------------------------------------
| Generate Access Token
|--------------------------------------------------------------------------
| Generates a signed JWT access token for authenticated users.
|--------------------------------------------------------------------------
*/
export const generateAccessToken = (
  payload: AccessTokenPayload
): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
};

/*
|--------------------------------------------------------------------------
| Verify Access Token
|--------------------------------------------------------------------------
| Verifies and decodes an access token.
|--------------------------------------------------------------------------
*/
export const verifyAccessToken = (
  token: string
): AccessTokenPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;

  return decoded;
};