import { Controller, Get, Param, Query } from '@nestjs/common';
import { BlogService } from './blog.service';
import { ListBlogPostsDto } from './dto/list-blog-posts.dto';

@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  list(@Query() dto: ListBlogPostsDto) {
    return this.blogService.list(dto);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.blogService.findBySlug(slug);
  }
}
