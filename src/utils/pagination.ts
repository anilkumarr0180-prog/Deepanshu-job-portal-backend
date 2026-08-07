export interface PaginationParams {
  page?: number | string;
  limit?: number | string;
}

export interface PaginationResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export const getPaginationOptions = (params: PaginationParams = {}) => {
  const parsedPage = Number(params.page);
  const parsedLimit = Number(params.limit);

  const page = !isNaN(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const limit =
    !isNaN(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 100
      ? parsedLimit
      : 10;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

export const buildPaginatedResult = <T>(
  items: T[],
  totalItems: number,
  page: number,
  limit: number
): PaginationResult<T> => {
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    items,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page * limit < totalItems,
      hasPrevPage: page > 1,
    },
  };
};
