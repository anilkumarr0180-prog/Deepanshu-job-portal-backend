import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as blogService from "../services/blog.service";
import { asyncHandler } from "../middleware/async-handler";

/*
|--------------------------------------------------------------------------
| Public Blog Controllers
|--------------------------------------------------------------------------
*/

export const getBlogs = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const blogs = await blogService.getPublicBlogs(req.query);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Blogs fetched successfully.",
      data: blogs,
    });
  }
);

export const getBlogBySlug = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const slug = req.params.slug as string;
    const blog = await blogService.getBlogBySlug(slug);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Blog fetched successfully.",
      data: blog,
    });
  }
);

export const getBlogCategories = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const categories = await blogService.getBlogCategories();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Blog categories fetched successfully.",
      data: categories,
    });
  }
);

export const getTrendingBlogs = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const limit = req.query.limit ? Number(req.query.limit) : 6;
    const blogs = await blogService.getTrendingBlogs(limit);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Trending blogs fetched successfully.",
      data: blogs,
    });
  }
);

export const getFeaturedBlogs = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const limit = req.query.limit ? Number(req.query.limit) : 6;
    const blogs = await blogService.getFeaturedBlogs(limit);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Featured blogs fetched successfully.",
      data: blogs,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Admin Blog Controllers
|--------------------------------------------------------------------------
*/

export const getAdminBlogs = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const blogs = await blogService.getAdminBlogs(req.query);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Admin blogs fetched successfully.",
      data: blogs,
    });
  }
);

export const getAdminBlogById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const blog = await blogService.getAdminBlogById(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Blog fetched successfully.",
      data: blog,
    });
  }
);

export const createBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authorId = req.user!.userId;
    const blog = await blogService.createBlog(req.body, authorId);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Blog created successfully.",
      data: blog,
    });
  }
);

export const updateBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const blog = await blogService.updateBlog(id, req.body);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Blog updated successfully.",
      data: blog,
    });
  }
);

export const deleteBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const result = await blogService.deleteBlog(id);
    res.status(HTTP_STATUS.OK).json(result);
  }
);

export const publishBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const blog = await blogService.publishBlog(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Blog published successfully.",
      data: blog,
    });
  }
);

export const unpublishBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const blog = await blogService.unpublishBlog(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Blog unpublished successfully.",
      data: blog,
    });
  }
);

export const archiveBlog = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const blog = await blogService.archiveBlog(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Blog archived successfully.",
      data: blog,
    });
  }
);
