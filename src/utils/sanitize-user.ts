import { IUser } from "../models/user.model";

export const sanitizeUser = (user: IUser) => {
  const userObject = user.toObject();

  const { password, ...safeUser } = userObject;

  return safeUser;
};