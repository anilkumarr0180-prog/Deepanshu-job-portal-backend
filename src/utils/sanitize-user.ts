export const sanitizeUser = <T extends Record<string, unknown> | object>(
  user: T
): Record<string, unknown> => {
  const u = user as Record<string, unknown> & {
    toObject?: () => Record<string, unknown>;
  };

  const userObject =
    typeof u?.toObject === "function"
      ? u.toObject()
      : { ...u };

  const { password: _password, ...safeUser } = userObject;

  return safeUser;
};