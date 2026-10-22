/**
 * FormCraft Storefront Client JS
 * Handles client-side validation, anti-spam honeypot, optional staged file upload,
 * and AJAX form submission without page reload.
 */

(function () {
  "use strict";

  function initFormCraft() {
    const containers = document.querySelectorAll("[data-formcraft]");

    containers.forEach(function (container) {
      if (container.dataset.initialized) return;
      container.dataset.initialized = "true";

      const form = container.querySelector(".formcraft-form");
      if (!form) return;

      const successAlert = container.querySelector(".formcraft-alert--success");
      const errorAlert = container.querySelector(".formcraft-alert--error");
      const submitBtn = container.querySelector(".formcraft-submit-btn");
      const btnText = container.querySelector(".formcraft-btn-text");
      const spinner = container.querySelector(".formcraft-spinner");

      const shop = container.dataset.shop || window.Shopify?.shop || "";
      const formId = container.dataset.formId || "default";
      const proxyUrl = container.dataset.appProxyUrl || "/apps/formcraft/submissions";

      function setLoading(isLoading) {
        if (submitBtn) submitBtn.disabled = isLoading;
        if (spinner) spinner.style.display = isLoading ? "inline-block" : "none";
      }

      function showAlert(type, message) {
        if (successAlert) successAlert.style.display = type === "success" ? "flex" : "none";
        if (errorAlert) {
          errorAlert.style.display = type === "error" ? "flex" : "none";
          if (message && type === "error") {
            const msgSpan = errorAlert.querySelector(".formcraft-alert-message");
            if (msgSpan) msgSpan.textContent = message;
          }
        }
      }

      function clearErrors() {
        const errorSpans = form.querySelectorAll(".formcraft-field-error");
        errorSpans.forEach(function (span) {
          span.style.display = "none";
          span.textContent = "";
        });
        const inputs = form.querySelectorAll(".formcraft-input, .formcraft-textarea");
        inputs.forEach(function (input) {
          input.classList.remove("has-error");
        });
        if (errorAlert) errorAlert.style.display = "none";
      }

      function setFieldError(fieldName, errorText) {
        const input = form.querySelector('[name="' + fieldName + '"]');
        if (input) {
          input.classList.add("has-error");
          const group = input.closest(".formcraft-group");
          if (group) {
            const errorSpan = group.querySelector(".formcraft-field-error");
            if (errorSpan) {
              errorSpan.textContent = errorText;
              errorSpan.style.display = "block";
            }
          }
        }
      }

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearErrors();

        // 1. Check honeypot field
        const hpField = form.querySelector('[name="_hp"]');
        if (hpField && hpField.value) {
          // Bot detected, silently show success without submitting
          showAlert("success", "Thank you! Your message has been sent.");
          form.reset();
          return;
        }

        // 2. Validate form inputs
        let hasError = false;

        const nameInput = form.querySelector('[name="name"]');
        if (nameInput && nameInput.hasAttribute("required") && !nameInput.value.trim()) {
          setFieldError("name", "Please enter your name.");
          hasError = true;
        }

        const emailInput = form.querySelector('[name="email"]');
        if (emailInput) {
          const emailVal = emailInput.value.trim();
          if (emailInput.hasAttribute("required") && !emailVal) {
            setFieldError("email", "Please enter your email address.");
            hasError = true;
          } else if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
            setFieldError("email", "Please enter a valid email address.");
            hasError = true;
          }
        }

        const msgInput = form.querySelector('[name="message"]');
        if (msgInput && msgInput.hasAttribute("required") && !msgInput.value.trim()) {
          setFieldError("message", "Please enter a message.");
          hasError = true;
        }

        // 3. Check attachment if selected
        const fileInput = form.querySelector('[name="attachment"]');
        let fileUploadInfo = null;

        if (fileInput && fileInput.files && fileInput.files.length > 0) {
          const file = fileInput.files[0];
          // 10MB limit
          if (file.size > 10 * 1024 * 1024) {
            setFieldError("attachment", "File size must not exceed 10MB.");
            hasError = true;
          }
        }

        if (hasError) return;

        setLoading(true);

        try {
          // If a file is attached, stage it through Shopify Files API
          if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];

            try {
              // Call staged upload endpoint
              const stageRes = await fetch("/api/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  shop: shop,
                  filename: file.name,
                  mimeType: file.type || "application/octet-stream",
                  fileSize: file.size,
                }),
              });

              if (stageRes.ok) {
                const stageData = await stageRes.json();
                if (stageData.target) {
                  // Upload to staged URL
                  const uploadForm = new FormData();
                  stageData.target.parameters.forEach(function (param) {
                    uploadForm.append(param.name, param.value);
                  });
                  uploadForm.append("file", file);

                  const putRes = await fetch(stageData.target.url, {
                    method: "POST",
                    body: uploadForm,
                  });

                  if (putRes.ok || putRes.status === 201) {
                    // Finalize file creation
                    const finalRes = await fetch("/api/upload", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        shop: shop,
                        action: "finalize",
                        originalSource: stageData.target.resourceUrl,
                        filename: file.name,
                        mimeType: file.type || "application/octet-stream",
                      }),
                    });

                    if (finalRes.ok) {
                      const finalData = await finalRes.json();
                      if (finalData.fileUrl) {
                        fileUploadInfo = {
                          url: finalData.fileUrl,
                          name: file.name,
                        };
                      }
                    }
                  }
                }
              }
            } catch (fileErr) {
              console.warn("FormCraft file upload warning:", fileErr);
              // Non-blocking: continue submitting form text if file staging encounters network issue
            }
          }

          // Build submission payload
          const payload = {
            shop: shop,
            form_id: formId,
            customer_name: nameInput ? nameInput.value.trim() : "",
            customer_email: emailInput ? emailInput.value.trim() : "",
            message: msgInput ? msgInput.value.trim() : "",
            uploaded_file_url: fileUploadInfo ? fileUploadInfo.url : undefined,
            uploaded_file_name: fileUploadInfo ? fileUploadInfo.name : undefined,
          };

          // Try submitting via App Proxy first, fallback to direct API endpoint
          let response;
          try {
            response = await fetch(proxyUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          } catch {
            // Fallback to direct /api/submissions
            response = await fetch("/api/submissions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          }

          const result = await response.json();

          if (result.success) {
            showAlert("success", result.message || "Thank you! Your message has been sent.");
            form.reset();
          } else {
            showAlert("error", result.error || "Failed to submit form. Please try again.");
          }
        } catch (err) {
          console.error("FormCraft submission error:", err);
          showAlert("error", "Network error. Please check your connection and try again.");
        } finally {
          setLoading(false);
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFormCraft);
  } else {
    initFormCraft();
  }

  // Support Shopify section rendering / Theme Editor events
  document.addEventListener("shopify:section:load", initFormCraft);
})();
