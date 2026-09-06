import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BlogCategory {
  PHAN_MEM = 'phan-mem',
  KINH_DOANH = 'kinh-doanh',
  XU_HUONG = 'xu-huong',
  HUONG_DAN = 'huong-dan',
}

@Entity('blog_posts')
@Index(['category', 'publishedAt'])
export class BlogPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  slug: string;

  @Column()
  title: string;

  @Column()
  excerpt: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: BlogCategory })
  category: BlogCategory;

  @Column({ name: 'cover_image_url', nullable: true, type: 'varchar' })
  coverImageUrl: string | null;

  @Column({ name: 'reading_minutes', type: 'int' })
  readingMinutes: number;

  @Column({ name: 'published_at', type: 'timestamp' })
  publishedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
