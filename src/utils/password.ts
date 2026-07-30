import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

/*
|--------------------------------------------------------------------------
| Hash Password
|--------------------------------------------------------------------------
| Converts a plain-text password into a secure hashed password.
*/
export const hashPassword = async (
  password: string
): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/*
|--------------------------------------------------------------------------
| Compare Password
|--------------------------------------------------------------------------
| Compares a plain-text password with a hashed password.
*/
export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};