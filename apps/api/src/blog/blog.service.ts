import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { BlogPost } from './entities/blog-post.entity';
import { ListBlogPostsDto } from './dto/list-blog-posts.dto';

const DEFAULT_PAGE_SIZE = 9;
const MAX_PAGE_SIZE = 50;

export interface BlogPostsResult {
  items: BlogPost[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class BlogService {
  constructor(
    @InjectRepository(BlogPost)
    private readonly blogPostsRepository: Repository<BlogPost>,
  ) {}

  async list(dto: ListBlogPostsDto): Promise<BlogPostsResult> {
    const page = clampPage(dto.page);
    const pageSize = clampPageSize(dto.pageSize);

    const base: FindOptionsWhere<BlogPost> = {};
    if (dto.category) base.category = dto.category;

    const query = dto.query?.trim();
    const where: FindOptionsWhere<BlogPost> | FindOptionsWhere<BlogPost>[] = query
      ? [
          { ...base, title: ILike(`%${query}%`) },
          { ...base, excerpt: ILike(`%${query}%`) },
        ]
      : base;

    const [items, total] = await this.blogPostsRepository.findAndCount({
      where,
      order: { publishedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items, total, page, pageSize };
  }

  async findBySlug(slug: string): Promise<BlogPost> {
    const post = await this.blogPostsRepository.findOne({ where: { slug } });
    if (!post) {
      throw new NotFoundException(`Bài viết với slug ${slug} không tồn tại`);
    }
    return post;
  }
}

function clampPage(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function clampPageSize(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}
