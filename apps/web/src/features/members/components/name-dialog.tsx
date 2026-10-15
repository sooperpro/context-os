import { zodResolver } from "@hookform/resolvers/zod";
import { OrgNameInputSchema, type OrgNameInput } from "@contextos/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { Spinner } from "@/components/ui/spinner";

interface NameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initialName?: string;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (input: OrgNameInput) => Promise<unknown> | void;
}

/** One-field dialog for creating or renaming a department or team. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initialName = "",
  submitLabel,
  isPending,
  onSubmit,
}: NameDialogProps) {
  const form = useForm<OrgNameInput>({
    resolver: zodResolver(OrgNameInputSchema),
    defaultValues: { name: initialName },
  });
  const { reset } = form;
  useEffect(() => {
    if (open) reset({ name: initialName });
  }, [open, initialName, reset]);
  const error = form.formState.errors.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit(values);
            onOpenChange(false);
          })}
          className="space-y-5"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="org-name">{label}</Label>
            <Input
              id="org-name"
              autoComplete="off"
              aria-invalid={!!error}
              {...form.register("name")}
            />
            {error ? <p className="text-xs text-destructive">{error.message}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Spinner /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
