import { IsIn, IsOptional, IsString } from 'class-validator';
import { BlogCategory } from '../entities/blog-post.entity';

export class ListBlogPostsDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(Object.values(BlogCategory))
  category?: BlogCategory;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
