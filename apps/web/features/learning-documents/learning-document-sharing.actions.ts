"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";

const shareDocumentSchema = z.object({
  documentId: z.string().uuid(),
  userEmail: z.string().email(),
  role: z.enum(["viewer", "editor"]),
});

const updateDocumentVisibilitySchema = z.object({
  documentId: z.string().uuid(),
  visibility: z.enum(["private", "shared", "public"]),
});

export async function shareLearningDocumentByEmailAction(
  input: z.infer<typeof shareDocumentSchema>
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const parsed = shareDocumentSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid sharing input.",
      };
    }

    const { documentId, userEmail, role } = parsed.data;

    const normalizedEmail = userEmail.trim().toLowerCase();

    const { data: document, error: documentError } = await supabase
      .from("learning_documents")
      .select("id,owner_id,visibility")
      .eq("id", documentId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (documentError) {
      return {
        success: false,
        message: `Failed to verify document ownership: ${documentError.message}`,
      };
    }

    if (!document) {
      return {
        success: false,
        message: "Document not found or you do not own it.",
      };
    }

    const { error: permissionError } = await supabase
      .from("learning_document_permissions")
      .upsert(
        {
          document_id: documentId,
          user_email: normalizedEmail,
          role,
          created_by: user.id,
        },
        {
          onConflict: "document_id,user_email",
        }
      );

    if (permissionError) {
      return {
        success: false,
        message: `Failed to create document permission: ${permissionError.message}`,
      };
    }

    if (document.visibility === "private") {
      const { error: visibilityError } = await supabase
        .from("learning_documents")
        .update({
          visibility: "shared",
        })
        .eq("id", documentId)
        .eq("owner_id", user.id);

      if (visibilityError) {
        return {
          success: false,
          message: `Permission was added, but failed to update visibility: ${visibilityError.message}`,
        };
      }
    }

    revalidatePath("/goals");
    revalidatePath("/settings");
    revalidatePath(`/documents/${documentId}/share`);
    revalidatePath(`/documents/shared/${documentId}`);

    return {
      success: true,
      message: "Document shared successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while sharing document.",
    };
  }
}

export async function removeLearningDocumentPermissionAction(
  permissionId: string
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const { data: permission, error: fetchError } = await supabase
      .from("learning_document_permissions")
      .select(
        `
        id,
        document_id,
        learning_documents!inner (
          owner_id
        )
        `
      )
      .eq("id", permissionId)
      .maybeSingle();

    if (fetchError) {
      return {
        success: false,
        message: `Failed to fetch permission: ${fetchError.message}`,
      };
    }

    if (!permission) {
      return {
        success: false,
        message: "Permission not found.",
      };
    }

    const ownerId = permission.learning_documents?.owner_id;

    if (ownerId !== user.id) {
      return {
        success: false,
        message: "You do not have permission to remove this access.",
      };
    }

    const { error: deleteError } = await supabase
      .from("learning_document_permissions")
      .delete()
      .eq("id", permissionId);

    if (deleteError) {
      return {
        success: false,
        message: `Failed to remove permission: ${deleteError.message}`,
      };
    }

    revalidatePath(`/documents/${permission.document_id}/share`);
    revalidatePath(`/documents/shared/${permission.document_id}`);

    return {
      success: true,
      message: "Document permission removed.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while removing document permission.",
    };
  }
}

export async function updateLearningDocumentVisibilityAction(
  input: z.infer<typeof updateDocumentVisibilitySchema>
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const parsed = updateDocumentVisibilitySchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid visibility input.",
      };
    }

    const { documentId, visibility } = parsed.data;

    const { error } = await supabase
      .from("learning_documents")
      .update({
        visibility,
      })
      .eq("id", documentId)
      .eq("owner_id", user.id);

    if (error) {
      return {
        success: false,
        message: `Failed to update visibility: ${error.message}`,
      };
    }

    revalidatePath(`/documents/${documentId}/share`);
    revalidatePath(`/documents/shared/${documentId}`);
    revalidatePath("/goals");

    return {
      success: true,
      message: "Document visibility updated.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while updating document visibility.",
    };
  }
}