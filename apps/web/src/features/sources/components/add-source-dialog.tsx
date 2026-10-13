import { zodResolver } from "@hookform/resolvers/zod";
import { SOURCE_CONTENT_MAX_LENGTH, SourceKindSchema } from "@contextos/shared";
import { UploadIcon } from "lucide-react";
import { useId, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCreateSource } from "@/features/sources/api/sources.queries";
import { dateInputToIso } from "@/lib/format";
import { SOURCE_KIND_OPTIONS } from "@/lib/labels";

/** Form-level schema: HTML inputs produce empty strings, the API wants omitted fields. */
const FormSchema = z.object({
  kind: SourceKindSchema,
  title: z.string().trim().min(1, "Title is required.").max(300),
  content: z
    .string()
    .trim()
    .min(1, "Paste or upload the source content.")
    .max(
      SOURCE_CONTENT_MAX_LENGTH,
      `Content must be at most ${SOURCE_CONTENT_MAX_LENGTH.toLocaleString()} characters.`,
    ),
  url: z.union([z.literal(""), z.url("Enter a full URL, including https://")]),
  author: z.string().trim().max(200),
  sourceCreatedAt: z.string(),
});
type FormValues = z.infer<typeof FormSchema>;

interface AddSourceDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSourceDialog({ projectId, open, onOpenChange }: AddSourceDialogProps) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const createSource = useCreateSource(projectId);
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      kind: "document",
      title: "",
      content: "",
      url: "",
      author: "",
      sourceCreatedAt: "",
    },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    createSource.mutate(
      {
        kind: values.kind,
        title: values.title,
        content: values.content,
        url: values.url || undefined,
        author: values.author || undefined,
        sourceCreatedAt: dateInputToIso(values.sourceCreatedAt),
      },
      {
        onSuccess: () => {
          toast.success("Source added", { description: "Processing starts in the background." });
          form.reset();
          onOpenChange(false);
        },
      },
    );
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    form.setValue("content", text, { shouldValidate: true, shouldDirty: true });
    if (!form.getValues("title")) form.setValue("title", file.name.replace(/\.[^.]+$/, ""));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Add a source</DialogTitle>
            <DialogDescription>
              Paste a document, exported thread, ticket or pull request. Keep the metadata honest:
              it becomes provenance for every claim extracted from it.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${id}-kind`}>Kind</Label>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <Select
                    items={SOURCE_KIND_OPTIONS}
                    value={field.value}
                    onValueChange={(value) => field.onChange(SourceKindSchema.parse(value))}
                  >
                    <SelectTrigger id={`${id}-kind`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_KIND_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-date`}>Source date</Label>
              <Input id={`${id}-date`} type="date" {...form.register("sourceCreatedAt")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`${id}-title`}>Title</Label>
              <Input
                id={`${id}-title`}
                placeholder="ADR-0007: Move billing to the ledger service"
                aria-invalid={Boolean(errors.title)}
                {...form.register("title")}
              />
              {errors.title ? (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-url`}>Link (optional)</Label>
              <Input
                id={`${id}-url`}
                type="url"
                placeholder="https://…"
                aria-invalid={Boolean(errors.url)}
                {...form.register("url")}
              />
              {errors.url ? <p className="text-xs text-destructive">{errors.url.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-author`}>Author (optional)</Label>
              <Input id={`${id}-author`} placeholder="Priya Shah" {...form.register("author")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${id}-content`}>Content</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => fileInput.current?.click()}
                >
                  <UploadIcon aria-hidden />
                  Upload .md / .txt
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".md,.markdown,.txt,text/plain,text/markdown"
                  className="hidden"
                  onChange={(event) => void onFile(event.target.files?.[0])}
                />
              </div>
              <Textarea
                id={`${id}-content`}
                rows={10}
                placeholder="Paste the full text here…"
                aria-invalid={Boolean(errors.content)}
                className="font-mono text-xs"
                {...form.register("content")}
              />
              {errors.content ? (
                <p className="text-xs text-destructive">{errors.content.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Up to {SOURCE_CONTENT_MAX_LENGTH.toLocaleString()} characters. Chunked, indexed
                  and analysed in the background.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSource.isPending}>
              {createSource.isPending ? <Spinner /> : null}
              Add source
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
