-- CreateTable
CREATE TABLE "repository_chunks" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "start_line" INTEGER NOT NULL,
    "end_line" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repository_chunks_repository_id_idx" ON "repository_chunks"("repository_id");

-- CreateIndex
CREATE INDEX "repository_chunks_project_id_updated_at_idx" ON "repository_chunks"("project_id", "updated_at");

-- AddForeignKey
ALTER TABLE "repository_chunks" ADD CONSTRAINT "repository_chunks_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_chunks" ADD CONSTRAINT "repository_chunks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lexical retrieval: GIN index over English full-text vectors.
CREATE INDEX "repository_chunks_content_fts_idx"
  ON "repository_chunks"
  USING GIN (to_tsvector('english', "content"));
