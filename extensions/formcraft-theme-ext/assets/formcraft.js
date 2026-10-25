/**
 * FormCraft Storefront Client JS
 * Supports 16 dynamic field types, 2-column grid layout, split image layout,
 * client-side validation, staged file uploads, and AJAX submissions.
 */

(function () {
  "use strict";

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderFieldHtml(field, blockId) {
    const id = field.id || "field_" + Math.random().toString(36).substring(2, 7);
    const label = escapeHtml(field.label || id);
    const placeholder = escapeHtml(field.placeholder || "");
    const isRequired = !!field.required;
    const reqHtml = isRequired ? '<span class="formcraft-required">*</span>' : '';
    const widthClass = field.width === "half" ? "formcraft-col-half" : "formcraft-col-full";
    const type = (field.type || "text").toLowerCase();

    // 13. Heading
    if (type === "heading") {
      return `
        <div class="formcraft-group ${widthClass}">
          <h3 class="formcraft-section-heading">${label}</h3>
          ${field.helpText ? `<p class="formcraft-paragraph">${escapeHtml(field.helpText)}</p>` : ""}
        </div>
      `;
    }

    // 14. Paragraph
    if (type === "paragraph") {
      return `
        <div class="formcraft-group ${widthClass}">
          <p class="formcraft-paragraph">${escapeHtml(field.label || field.placeholder || "")}</p>
        </div>
      `;
    }

    // 15. Divider
    if (type === "divider") {
      return `
        <div class="formcraft-group formcraft-col-full">
          <hr class="formcraft-divider">
        </div>
      `;
    }

    // 12. Consent Checkbox
    if (type === "consent") {
      return `
        <div class="formcraft-group ${widthClass}" data-field-id="${id}" data-type="consent" data-required="${isRequired}">
          <label class="formcraft-consent-group">
            <input type="checkbox" name="${id}" ${isRequired ? "required" : ""}>
            <span>${label} ${reqHtml}</span>
          </label>
          ${field.helpText ? `<span class="formcraft-help-text">${escapeHtml(field.helpText)}</span>` : ""}
          <span class="formcraft-field-error" style="display: none;"></span>
        </div>
      `;
    }

    // 9. Dropdown / Select
    if (type === "dropdown" || type === "select") {
      const options = Array.isArray(field.options) ? field.options : [];
      let optionsHtml = `<option value="">${placeholder || "Select an option..."}</option>`;
      options.forEach(function (opt) {
        const val = escapeHtml(typeof opt === "string" ? opt : opt.value || opt.label || "");
        optionsHtml += `<option value="${val}">${val}</option>`;
      });

      return `
        <div class="formcraft-group ${widthClass}" data-field-id="${id}" data-type="dropdown" data-required="${isRequired}">
          <label class="formcraft-label" for="fc_${id}_${blockId}">
            ${label} ${reqHtml}
          </label>
          <select id="fc_${id}_${blockId}" name="${id}" class="formcraft-select" ${isRequired ? "required" : ""}>
            ${optionsHtml}
          </select>
          ${field.helpText ? `<span class="formcraft-help-text">${escapeHtml(field.helpText)}</span>` : ""}
          <span class="formcraft-field-error" style="display: none;"></span>
        </div>
      `;
    }

    // 10. Radio Group
    if (type === "radio") {
      const options = Array.isArray(field.options) ? field.options : [];
      let radiosHtml = "";
      options.forEach(function (opt, idx) {
        const val = escapeHtml(typeof opt === "string" ? opt : opt.value || opt.label || "");
        const radioId = `fc_opt_${id}_${idx}_${blockId}`;
        radiosHtml += `
          <label class="formcraft-choice-item" for="${radioId}">
            <input type="radio" id="${radioId}" name="${id}" value="${val}">
            <span>${val}</span>
          </label>
        `;
      });

      return `
        <div class="formcraft-group ${widthClass}" data-field-id="${id}" data-type="radio" data-required="${isRequired}">
          <span class="formcraft-label">${label} ${reqHtml}</span>
          ${field.helpText ? `<span class="formcraft-help-text">${escapeHtml(field.helpText)}</span>` : ""}
          <div class="formcraft-choice-group">
            ${radiosHtml}
          </div>
          <span class="formcraft-field-error" style="display: none;"></span>
        </div>
      `;
    }

    // 11. Checkboxes Group
    if (type === "checkboxes" || type === "checkbox") {
      const options = Array.isArray(field.options) ? field.options : [];
      let checksHtml = "";
      options.forEach(function (opt, idx) {
        const val = escapeHtml(typeof opt === "string" ? opt : opt.value || opt.label || "");
        const checkId = `fc_chk_${id}_${idx}_${blockId}`;
        checksHtml += `
          <label class="formcraft-choice-item" for="${checkId}">
            <input type="checkbox" id="${checkId}" name="${id}[]" value="${val}">
            <span>${val}</span>
          </label>
        `;
      });

      return `
        <div class="formcraft-group ${widthClass}" data-field-id="${id}" data-type="checkboxes" data-required="${isRequired}">
          <span class="formcraft-label">${label} ${reqHtml}</span>
          ${field.helpText ? `<span class="formcraft-help-text">${escapeHtml(field.helpText)}</span>` : ""}
          <div class="formcraft-choice-group">
            ${checksHtml}
          </div>
          <span class="formcraft-field-error" style="display: none;"></span>
        </div>
      `;
    }

    // 2. Textarea
    if (type === "textarea") {
      return `
        <div class="formcraft-group ${widthClass}" data-field-id="${id}" data-type="textarea" data-required="${isRequired}">
          <label class="formcraft-label" for="fc_${id}_${blockId}">
            ${label} ${reqHtml}
          </label>
          <textarea 
            id="fc_${id}_${blockId}" 
            name="${id}" 
            class="formcraft-textarea" 
            rows="4" 
            placeholder="${placeholder}"
            ${isRequired ? "required" : ""}
          ></textarea>
          ${field.helpText ? `<span class="formcraft-help-text">${escapeHtml(field.helpText)}</span>` : ""}
          <span class="formcraft-field-error" style="display: none;"></span>
        </div>
      `;
    }

    // 16. File Upload
    if (type === "file") {
      return `
        <div class="formcraft-group ${widthClass}" data-field-id="${id}" data-type="file" data-required="${isRequired}">
          <label class="formcraft-label" for="fc_${id}_${blockId}">
            ${label} ${reqHtml}
          </label>
          <input 
            type="file" 
            id="fc_${id}_${blockId}" 
            name="${id}" 
            class="formcraft-file-input" 
            accept="image/*,.pdf,.doc,.docx,.txt"
            ${isRequired ? "required" : ""}
          >
          <div class="formcraft-help-text">Images, PDFs, or Docs (Max 10MB)</div>
          <span class="formcraft-field-error" style="display: none;"></span>
        </div>
      `;
    }

    // Input Types: text, email, name, phone, number, url, datetime
    let inputType = "text";
    let autoComp = "";

    if (type === "email") inputType = "email";
    else if (type === "name") {
      inputType = "text";
      autoComp = 'autocomplete="name"';
    } else if (type === "phone") {
      inputType = "tel";
      autoComp = 'autocomplete="tel"';
    } else if (type === "number") inputType = "number";
    else if (type === "url") inputType = "url";
    else if (type === "datetime") inputType = "datetime-local";

    return `
      <div class="formcraft-group ${widthClass}" data-field-id="${id}" data-type="${type}" data-required="${isRequired}">
        <label class="formcraft-label" for="fc_${id}_${blockId}">
          ${label} ${reqHtml}
        </label>
        <input 
          type="${inputType}" 
          id="fc_${id}_${blockId}" 
          name="${id}" 
          class="formcraft-input" 
          placeholder="${placeholder}"
          ${autoComp}
          ${isRequired ? "required" : ""}
        >
        ${field.helpText ? `<span class="formcraft-help-text">${escapeHtml(field.helpText)}</span>` : ""}
        <span class="formcraft-field-error" style="display: none;"></span>
      </div>
    `;
  }

  function initFormCraft() {
    const containers = document.querySelectorAll("[data-formcraft]");

    containers.forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";

      const wrapper = container.closest(".formcraft-wrapper");
      const blockId = (wrapper && wrapper.id) ? wrapper.id.replace("formcraft-block-", "") : "b1";

      const form = container.querySelector(".formcraft-form");
      const grid = container.querySelector(".formcraft-grid");
      const successAlert = container.querySelector(".formcraft-alert--success");
      const errorAlert = container.querySelector(".formcraft-alert--error");
      const submitBtn = container.querySelector(".formcraft-submit-btn");
      const btnText = container.querySelector(".formcraft-btn-text");
      const spinner = container.querySelector(".formcraft-spinner");
      const titleEl = container.querySelector(".formcraft-title");
      const descEl = container.querySelector(".formcraft-description");

      const shop = container.dataset.shop || window.Shopify?.shop || "";
      const formId = container.dataset.formId || "";
      const proxyUrl = container.dataset.appProxyUrl || "/apps/formcraft/submissions";
      const uploadUrl = container.dataset.uploadProxyUrl || "/apps/formcraft/upload";

      // Apply styling overrides if set
      if (wrapper) {
        if (container.dataset.buttonBg) wrapper.style.setProperty("--formcraft-primary", container.dataset.buttonBg);
        if (container.dataset.buttonText) wrapper.style.setProperty("--formcraft-text", container.dataset.buttonText);
        if (container.dataset.maxWidth) wrapper.style.setProperty("--formcraft-max-width", container.dataset.maxWidth + "px");
      }

      function setLoading(isLoading) {
        if (submitBtn) submitBtn.disabled = isLoading;
        if (spinner) spinner.style.display = isLoading ? "inline-block" : "none";
      }

      function showAlert(type, message) {
        if (successAlert) {
          successAlert.style.display = type === "success" ? "flex" : "none";
          if (type === "success" && message) {
            const msgEl = successAlert.querySelector(".formcraft-alert-message");
            if (msgEl) msgEl.textContent = message;
          }
        }
        if (errorAlert) {
          errorAlert.style.display = type === "error" ? "flex" : "none";
          if (type === "error" && message) {
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
        const inputs = form.querySelectorAll(".formcraft-input, .formcraft-textarea, .formcraft-select");
        inputs.forEach(function (input) {
          input.classList.remove("has-error");
        });
        if (errorAlert) errorAlert.style.display = "none";
      }

      function setGroupError(group, message) {
        if (!group) return;
        const errSpan = group.querySelector(".formcraft-field-error");
        if (errSpan) {
          errSpan.textContent = message;
          errSpan.style.display = "block";
        }
        const control = group.querySelector(".formcraft-input, .formcraft-textarea, .formcraft-select");
        if (control) control.classList.add("has-error");
      }

      const cacheKey = formId ? "formcraft_cache_" + formId : null;

      function applyFormConfig(formConfig) {
        if (!formConfig) return;

        // Apply title / description / button label if not overridden by block settings
        if (formConfig.title && titleEl && !titleEl.textContent.trim()) {
          titleEl.textContent = formConfig.title;
        }
        if (formConfig.description && descEl && !descEl.textContent.trim()) {
          descEl.textContent = formConfig.description;
        }
        if (formConfig.submit_label && btnText) {
          btnText.textContent = formConfig.submit_label;
        }

        // Apply appearance_config defaults if present
        if (formConfig.appearance_config && wrapper) {
          const appConf = formConfig.appearance_config;
          if (appConf.primary_color && !container.dataset.buttonBg) {
            wrapper.style.setProperty("--formcraft-primary", appConf.primary_color);
          }
          if (appConf.button_text_color && !container.dataset.buttonText) {
            wrapper.style.setProperty("--formcraft-text", appConf.button_text_color);
          }
          if (appConf.max_width && !container.dataset.maxWidth) {
            wrapper.style.setProperty("--formcraft-max-width", appConf.max_width + "px");
          }
        }

        // Handle Split Image Layout
        const isSplit = formConfig.layout === "split_image" && !!formConfig.image_url;
        if (isSplit && wrapper) {
          wrapper.classList.add("formcraft-wrapper--split");
          const card = container.querySelector(".formcraft-form-card");
          if (card && !card.classList.contains("formcraft-split-container")) {
            const splitWrapper = document.createElement("div");
            splitWrapper.className = "formcraft-split-container";

            const imgDiv = document.createElement("div");
            imgDiv.className = "formcraft-split-image";
            imgDiv.style.backgroundImage = `url('${formConfig.image_url}')`;

            card.classList.remove("formcraft-form-card");
            card.classList.add("formcraft-split-body");

            card.parentNode.insertBefore(splitWrapper, card);
            splitWrapper.appendChild(imgDiv);
            splitWrapper.appendChild(card);
          }
        }

        // Render fields list into grid and remove loading skeleton
        const fieldsList = Array.isArray(formConfig) ? formConfig : formConfig.fields || [];
        if (grid && Array.isArray(fieldsList) && fieldsList.length > 0) {
          grid.classList.remove("formcraft-grid--loading");
          grid.innerHTML = fieldsList
            .filter(function (f) { return f.enabled !== false; })
            .map(function (f) { return renderFieldHtml(f, blockId); })
            .join("");
        }
      }

      // Dynamic Form Hydration with Instant Local Cache
      async function hydrateForm() {
        let formConfig = null;

        // 1. Check if raw config was inlined in data attribute
        if (container.dataset.formConfig) {
          try {
            formConfig = JSON.parse(container.dataset.formConfig);
          } catch (e) {
            console.warn("Could not parse inline data-form-config:", e);
          }
        }

        // 2. Instant cache check (0ms load on page reload - eliminates default form flash)
        if (!formConfig && cacheKey) {
          try {
            const cached = localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
            if (cached) {
              formConfig = JSON.parse(cached);
              applyFormConfig(formConfig);
            }
          } catch (cacheErr) {}
        } else if (formConfig) {
          applyFormConfig(formConfig);
        }

        // 3. Fetch remote form config from API (stale-while-revalidate)
        if (formId) {
          try {
            const endpoint = `${proxyUrl}?formId=${encodeURIComponent(formId)}&shop=${encodeURIComponent(shop)}`;
            let res = await fetch(endpoint);
            if (!res.ok) {
              // Direct fallback
              res = await fetch(`/api/submissions?formId=${encodeURIComponent(formId)}&shop=${encodeURIComponent(shop)}`);
            }
            if (res.ok) {
              const data = await res.json();
              if (data.form) {
                const freshConfig = {
                  fields: data.form.fields_config,
                  layout: data.form.layout,
                  image_url: data.form.image_url,
                  appearance_config: data.form.appearance_config,
                  title: data.form.title,
                  description: data.form.description,
                  submit_label: data.form.submit_label,
                  success_message: data.form.success_message,
                };
                if (cacheKey) {
                  try {
                    localStorage.setItem(cacheKey, JSON.stringify(freshConfig));
                  } catch (e) {}
                }
                applyFormConfig(freshConfig);
              }
            }
          } catch (fetchErr) {
            console.warn("Could not fetch remote form config:", fetchErr);
          }
        }
      }

      hydrateForm();

      // Form Submit Handler
      if (form) {
        form.addEventListener("submit", async function (e) {
          e.preventDefault();
          clearErrors();

          // 1. Honeypot check
          const hpField = form.querySelector('[name="_hp"]');
          if (hpField && hpField.value) {
            showAlert("success", "Thank you! Your message has been sent.");
            form.reset();
            return;
          }

          // 2. Validate all rendered fields
          let hasError = false;
          const groups = form.querySelectorAll(".formcraft-group");

          groups.forEach(function (group) {
            const isRequired = group.dataset.required === "true";
            const type = group.dataset.type || "text";

            // Static elements don't validate
            if (type === "heading" || type === "paragraph" || type === "divider") return;

            // Consent validation
            if (type === "consent") {
              const chk = group.querySelector('input[type="checkbox"]');
              if (isRequired && chk && !chk.checked) {
                setGroupError(group, "Please agree to proceed.");
                hasError = true;
              }
              return;
            }

            // Radio group validation
            if (type === "radio") {
              if (isRequired) {
                const checked = group.querySelector('input[type="radio"]:checked');
                if (!checked) {
                  setGroupError(group, "Please select an option.");
                  hasError = true;
                }
              }
              return;
            }

            // Checkboxes group validation
            if (type === "checkboxes") {
              if (isRequired) {
                const checked = group.querySelectorAll('input[type="checkbox"]:checked');
                if (!checked || checked.length === 0) {
                  setGroupError(group, "Please select at least one option.");
                  hasError = true;
                }
              }
              return;
            }

            // File input validation
            if (type === "file") {
              const fileInput = group.querySelector('input[type="file"]');
              if (fileInput && fileInput.files && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                if (file.size > 10 * 1024 * 1024) {
                  setGroupError(group, "File size must not exceed 10MB.");
                  hasError = true;
                }
              } else if (isRequired) {
                setGroupError(group, "Please choose a file to upload.");
                hasError = true;
              }
              return;
            }

            // Standard inputs / textarea / select
            const input = group.querySelector(".formcraft-input, .formcraft-textarea, .formcraft-select");
            if (input) {
              const val = input.value.trim();
              if (isRequired && !val) {
                const labelText = group.querySelector(".formcraft-label")?.childNodes[0]?.textContent?.trim() || "This field";
                setGroupError(group, `${labelText} is required.`);
                hasError = true;
                return;
              }

              if (type === "email" && val) {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                  setGroupError(group, "Please enter a valid email address.");
                  hasError = true;
                  return;
                }
              }

              if (type === "url" && val) {
                if (!/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(val)) {
                  setGroupError(group, "Please enter a valid URL (e.g. https://example.com).");
                  hasError = true;
                  return;
                }
              }
            }
          });

          if (hasError) return;

          setLoading(true);

          try {
            // 3. Staged File Upload Flow (for any attached files)
            const fileInputs = form.querySelectorAll('input[type="file"]');
            const fileResults = {};

            for (let i = 0; i < fileInputs.length; i++) {
              const fInput = fileInputs[i];
              if (fInput.files && fInput.files.length > 0) {
                const file = fInput.files[0];
                try {
                  // Stage file
                  let stageRes = await fetch(uploadUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      shop: shop,
                      filename: file.name,
                      mimeType: file.type || "application/octet-stream",
                      fileSize: file.size,
                    }),
                  });

                  if (!stageRes.ok) {
                    // Fallback to direct API
                    stageRes = await fetch("/api/upload", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        shop: shop,
                        filename: file.name,
                        mimeType: file.type || "application/octet-stream",
                        fileSize: file.size,
                      }),
                    });
                  }

                  if (stageRes.ok) {
                    const stageData = await stageRes.json();
                    if (stageData.target) {
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
                        let finalRes = await fetch(uploadUrl, {
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

                        if (!finalRes.ok) {
                          finalRes = await fetch("/api/upload", {
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
                        }

                        if (finalRes.ok) {
                          const finalData = await finalRes.json();
                          if (finalData.fileUrl) {
                            fileResults[fInput.name] = {
                              url: finalData.fileUrl,
                              name: file.name,
                            };
                          }
                        }
                      }
                    }
                  }
                } catch (uploadErr) {
                  console.warn("Staged file upload warning:", uploadErr);
                }
              }
            }

            // 4. Compile dynamic submission_data
            const dynamicEntries = [];
            let primaryName = "";
            let firstName = "";
            let lastName = "";
            let primaryEmail = "";
            let primaryMessage = "";
            let primaryFileUrl = "";
            let primaryFileName = "";

            groups.forEach(function (group) {
              const fieldId = group.dataset.fieldId;
              const type = group.dataset.type || "text";
              if (!fieldId || type === "heading" || type === "paragraph" || type === "divider") return;

              const labelEl = group.querySelector(".formcraft-label") || group.querySelector(".formcraft-consent-group span");
              let labelText = fieldId;
              if (labelEl) {
                const clone = labelEl.cloneNode(true);
                const reqSpan = clone.querySelector(".formcraft-required");
                if (reqSpan) reqSpan.remove();
                labelText = clone.textContent.trim() || fieldId;
              }

              let fieldValue = "";

              if (type === "consent") {
                const chk = group.querySelector('input[type="checkbox"]');
                fieldValue = chk && chk.checked ? "Yes, Agreed" : "No";
              } else if (type === "radio") {
                const checked = group.querySelector('input[type="radio"]:checked');
                fieldValue = checked ? checked.value : "";
              } else if (type === "checkboxes") {
                const checkedList = group.querySelectorAll('input[type="checkbox"]:checked');
                const vals = [];
                checkedList.forEach(function (c) { vals.push(c.value); });
                fieldValue = vals;
              } else if (type === "file") {
                const fileInfo = fileResults[fieldId];
                if (fileInfo) {
                  fieldValue = fileInfo.url;
                  if (!primaryFileUrl) {
                    primaryFileUrl = fileInfo.url;
                    primaryFileName = fileInfo.name;
                  }
                }
              } else {
                const control = group.querySelector(".formcraft-input, .formcraft-textarea, .formcraft-select");
                if (control) fieldValue = control.value.trim();
              }

              // Extract top-level legacy fields
              if (fieldId === "first_name" || fieldId === "firstname") {
                firstName = fieldValue;
              } else if (fieldId === "last_name" || fieldId === "lastname") {
                lastName = fieldValue;
              } else if (type === "name" || fieldId === "name") {
                if (!primaryName && typeof fieldValue === "string") primaryName = fieldValue;
              }
              if (type === "email" || fieldId === "email") {
                if (!primaryEmail && typeof fieldValue === "string") primaryEmail = fieldValue;
              }
              if (type === "textarea" || fieldId === "message") {
                if (!primaryMessage && typeof fieldValue === "string") primaryMessage = fieldValue;
              }

              dynamicEntries.push({
                id: fieldId,
                label: labelText,
                type: type,
                value: fieldValue,
              });
            });

            if (!primaryName && (firstName || lastName)) {
              primaryName = [firstName, lastName].filter(Boolean).join(" ");
            }

            // 5. Submit payload to API
            const payload = {
              shop: shop,
              form_id: formId,
              customer_name: primaryName,
              customer_email: primaryEmail,
              message: primaryMessage,
              uploaded_file_url: primaryFileUrl || undefined,
              uploaded_file_name: primaryFileName || undefined,
              submission_data: dynamicEntries,
            };

            // Also attach each field directly onto payload for backwards & forwards compatibility
            dynamicEntries.forEach(function (entry) {
              if (entry.id && !(entry.id in payload)) {
                payload[entry.id] = entry.value;
              }
            });

            let response;
            try {
              response = await fetch(proxyUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
            } catch (proxyErr) {
              // Direct fallback
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
              showAlert("error", result.error || "Failed to submit form. Please check your fields and try again.");
            }
          } catch (netErr) {
            console.error("FormCraft submission network error:", netErr);
            showAlert("error", "Network connection error. Please check your connection and try again.");
          } finally {
            setLoading(false);
          }
        });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFormCraft);
  } else {
    initFormCraft();
  }

  // Support Shopify section rendering & Theme Editor block reload events
  document.addEventListener("shopify:section:load", initFormCraft);
  document.addEventListener("shopify:block:select", initFormCraft);
})();
