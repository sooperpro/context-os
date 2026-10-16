import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateProjectInputSchema,
  ProjectCategorySchema,
  type CreateProjectInput,
  type ProjectCategory,
} from "@contextos/shared";
import { useEffect, useId } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
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
import { PROJECT_CATEGORY_OPTIONS } from "@/features/knowledge/categories";
import { useCreateProject } from "@/features/projects/api/projects.queries";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Knowledge Hub collection to preselect; "Projects" when omitted. */
  defaultCategory?: ProjectCategory;
}

const CATEGORY_ITEMS = Object.fromEntries(
  PROJECT_CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
);

export function CreateProjectDialog({
  open,
  onOpenChange,
  defaultCategory = "project",
}: CreateProjectDialogProps) {
  const id = useId();
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(CreateProjectInputSchema),
    defaultValues: { name: "", description: "", category: defaultCategory },
  });
  const errors = form.formState.errors;
  const category = useWatch({ control: form.control, name: "category" }) ?? "project";

  // Opening from another collection preselects it, unless the user already picked one.
  useEffect(() => {
    if (open && !form.formState.dirtyFields.category) form.setValue("category", defaultCategory);
  }, [open, defaultCategory, form]);

  const onSubmit = form.handleSubmit((values) => {
    createProject.mutate(values, {
      onSuccess: (project) => {
        toast.success("Project created");
        form.reset({ name: "", description: "", category: defaultCategory });
        onOpenChange(false);
        void navigate(`/projects/${project.id}`);
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              A project is the unit ContextOS reconstructs: one hub, one set of sources.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                placeholder="Billing platform"
                aria-invalid={Boolean(errors.name)}
                {...form.register("name")}
              />
              {errors.name ? (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-category`}>Collection</Label>
              <Controller
                control={form.control}
                name="category"
                render={({ field }) => (
                  <Select
                    items={CATEGORY_ITEMS}
                    value={field.value ?? "project"}
                    onValueChange={(value) => field.onChange(ProjectCategorySchema.parse(value))}
                  >
                    <SelectTrigger id={`${id}-category`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_CATEGORY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Where it appears in the Knowledge Hub:{" "}
                {PROJECT_CATEGORY_OPTIONS.find(
                  (option) => option.value === category,
                )?.description.toLowerCase()}
                .
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description (optional)</Label>
              <Textarea
                id="project-description"
                rows={3}
                placeholder="What the team is building, in one or two sentences."
                {...form.register("description")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProject.isPending}>
              {createProject.isPending ? <Spinner /> : null}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
