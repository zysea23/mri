document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('upload-form');
    const reportFileInput = document.getElementById('report-file');
    const uploadButton = document.getElementById('upload-button');
    const loadingIndicator = document.getElementById('loading');
    const resultsContainer = document.getElementById('results');
    const originalContent = document.getElementById('original-content');
    const explanationContent = document.getElementById('explanation-content');
    const translatedContentChinese = document.getElementById('translated-content-chinese');
    const translatedContentSpanish = document.getElementById('translated-content-spanish');
    const translationLoading = document.getElementById('translation-loading');
    const languageTabs = document.querySelectorAll('.language-tab');
    
    // New elements for indicators
    const indicatorsTable = document.getElementById('indicators-table').querySelector('tbody');
    const indicatorsCount = document.getElementById('indicators-count');
    const exportCsvButton = document.getElementById('export-csv-button');
    
    // Q&A elements
    const questionInput = document.getElementById('question-input');
    const askButton = document.getElementById('ask-button');
    const qaHistory = document.getElementById('qa-history');
    const qaLoading = document.getElementById('qa-loading');
   
    // Store content for translation and Q&A
    let explanationText = '';
    let reportContentText = '';
    let isChineseTranslated = false;
    let isSpanishTranslated = false;
    let medicalIndicators = {}; // Store extracted indicators
   
    // Display file selection status
    reportFileInput.addEventListener('change', function() {
        const fileName = this.files[0] ? this.files[0].name : 'No file chosen';
        this.nextElementSibling.textContent = fileName;
    });
   
    // Handle form submission
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        // Check if a file is selected
        if (!reportFileInput.files[0]) {
            alert('Please select a medical report image');
            return;
        }
        // Show loading state
        uploadButton.disabled = true;
        loadingIndicator.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
       
        // Reset translation status and Q&A history
        isChineseTranslated = false;
        isSpanishTranslated = false;
        translatedContentChinese.textContent = '';
        translatedContentSpanish.textContent = '';
        explanationContent.classList.add('active-content');
        translatedContentChinese.classList.remove('active-content');
        translatedContentSpanish.classList.remove('active-content');
        setActiveLanguageTab('original');
        qaHistory.innerHTML = '';
        
        // Clear indicators
        indicatorsTable.innerHTML = '';
        medicalIndicators = {};
       
        // Prepare form data
        const formData = new FormData();
        formData.append('file', reportFileInput.files[0]);
       
        try {
            // Send request
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
           
            // Process response
            const result = await response.json();
            if (result.success) {
                // Store content for later use
                explanationText = result.explanation;
                reportContentText = result.original_content;
                medicalIndicators = result.indicators || {};
             
                // Display results
                originalContent.textContent = result.original_content;
                explanationContent.textContent = result.explanation;
                
                // Display medical indicators
                displayMedicalIndicators(medicalIndicators);
                
                // Ensure explanation content is visible initially
                explanationContent.classList.add('active-content');
                resultsContainer.classList.remove('hidden');
            } else {
                alert('Processing failed: ' + result.message);
            }
        } catch (error) {
            alert('Request Failed: ' + error.message);
        } finally {
            // Restore state
            uploadButton.disabled = false;
            loadingIndicator.classList.add('hidden');
        }
    });
    
    // Function to display medical indicators
    function displayMedicalIndicators(indicators) {
        // Clear previous indicators
        indicatorsTable.innerHTML = '';
        
        // Check if indicators are present
        if (!indicators || Object.keys(indicators).length === 0) {
            indicatorsCount.textContent = '0 indicators found';
            indicatorsTable.innerHTML = '<tr><td colspan="2">No indicators found in the report</td></tr>';
            return;
        }
        
        // Update indicators count
        const count = Object.keys(indicators).length;
        indicatorsCount.textContent = `${count} indicator${count !== 1 ? 's' : ''} found`;
        
        // Sort indicators alphabetically by name
        const sortedIndicators = Object.entries(indicators).sort((a, b) => a[0].localeCompare(b[0]));
        
        // Add indicators to table
        sortedIndicators.forEach(([name, value]) => {
            const row = document.createElement('tr');
            
            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            
            const valueCell = document.createElement('td');
            valueCell.textContent = value;
            
            row.appendChild(nameCell);
            row.appendChild(valueCell);
            indicatorsTable.appendChild(row);
        });
    }
    
    // Handle export CSV button
    exportCsvButton.addEventListener('click', async function() {
        if (!medicalIndicators || Object.keys(medicalIndicators).length === 0) {
            alert('No indicators available to export');
            return;
        }
        
        try {
            // Show loading state (could add a specific loading indicator for export)
            exportCsvButton.disabled = true;
            
            // Send request to export CSV
            const response = await fetch('/export-indicators', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    indicators: medicalIndicators
                })
            });
            
            if (response.ok) {
                // Create a blob from the response
                const blob = await response.blob();
                
                // Create a download link and click it
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'medical_indicators.csv';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
            } else {
                const errorData = await response.json();
                alert('Export failed: ' + (errorData.message || 'Unknown error'));
            }
        } catch (error) {
            alert('Export failed: ' + error.message);
        } finally {
            exportCsvButton.disabled = false;
        }
    });
   
    // Handle language tab switching
    languageTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const language = this.getAttribute('data-language');
         
            if (language === 'chinese' && !isChineseTranslated) {
                translateExplanation('Chinese');
            } else if (language === 'spanish' && !isSpanishTranslated) {
                translateExplanation('Spanish');
            } else {
                setActiveLanguageTab(language);
            }
        });
    });
   
    // Handle Q&A submission
    askButton.addEventListener('click', async function() {
        handleQuestionSubmission();
    });
   
    // Handle Enter key press in question input
    questionInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleQuestionSubmission();
        }
    });
   
    // Function to handle question submission
    async function handleQuestionSubmission() {
        const question = questionInput.value.trim();
     
        // Validate input
        if (!question) {
            alert('Please enter a question');
            return;
        }
     
        if (!reportContentText) {
            alert('Please upload a medical report first');
            return;
        }
     
        // Show loading indicator
        askButton.disabled = true;
        qaLoading.classList.remove('hidden');
     
        try {
            // Add question to history
            addQuestionToHistory(question);
         
            // Clear input field
            questionInput.value = '';
         
            // Check if RAG is enabled
            const ragEnabled = document.getElementById('rag-enabled').checked;
         
            let response;
            if (ragEnabled) {
                // Use RAG enhanced answering
                response = await fetch('/rag-enhance', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        report_content: reportContentText,
                        question: question
                    })
                });
            } else {
                // Use original answering method
                response = await fetch('/ask', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        report_content: reportContentText,
                        question: question
                    })
                });
            }
         
            // Process response
            const result = await response.json();
         
            if (result.success) {
                // Add answer to history
                if (ragEnabled) {
                    addAnswerToHistory(result.enhanced_explanation);
                 
                    // Show references
                    if (result.references && result.references.length > 0) {
                        displayReferences(result.references);
                    } else {
                        hideReferences();
                    }
                } else {
                    addAnswerToHistory(result.answer);
                    hideReferences();
                }
            } else {
                // Add error message to history
                addAnswerToHistory(`Error: ${result.message}`);
                hideReferences();
            }
        } catch (error) {
            // Add error message to history
            addAnswerToHistory(`Error: ${error.message}`);
            hideReferences();
        } finally {
            // Restore state
            askButton.disabled = false;
            qaLoading.classList.add('hidden');
        }
    }
   
    // Function to add question to history
    function addQuestionToHistory(question) {
        // Create question container if no answer exists yet
        const existingPair = qaHistory.querySelector('.qa-pair:last-child:not(.complete)');
     
        if (existingPair) {
            // Update existing pair
            const questionElement = existingPair.querySelector('.qa-question');
            questionElement.textContent = question;
        } else {
            // Create new pair
            const pair = document.createElement('div');
            pair.className = 'qa-pair';
         
            const questionElement = document.createElement('div');
            questionElement.className = 'qa-question';
            questionElement.textContent = question;
         
            pair.appendChild(questionElement);
            qaHistory.appendChild(pair);
        }
     
        // Scroll to bottom
        qaHistory.scrollTop = qaHistory.scrollHeight;
    }
   
    // Function to add answer to history
    function addAnswerToHistory(answer) {
        const existingPair = qaHistory.querySelector('.qa-pair:last-child:not(.complete)');
     
        if (existingPair) {
            // Add answer to existing pair
            const answerElement = document.createElement('div');
            answerElement.className = 'qa-answer';
            answerElement.textContent = answer;
         
            existingPair.appendChild(answerElement);
            existingPair.classList.add('complete');
        } else {
            // Create new pair (shouldn't happen but just in case)
            const pair = document.createElement('div');
            pair.className = 'qa-pair complete';
         
            const questionElement = document.createElement('div');
            questionElement.className = 'qa-question';
            questionElement.textContent = 'Unknown question';
         
            const answerElement = document.createElement('div');
            answerElement.className = 'qa-answer';
            answerElement.textContent = answer;
         
            pair.appendChild(questionElement);
            pair.appendChild(answerElement);
            qaHistory.appendChild(pair);
        }
     
        // Scroll to bottom
        qaHistory.scrollTop = qaHistory.scrollHeight;
    }
   
    // Function to set active language tab and content
    function setActiveLanguageTab(language) {
        // Update tab active state
        languageTabs.forEach(tab => {
            if (tab.getAttribute('data-language') === language) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
       
        // Update content visibility
        explanationContent.classList.remove('active-content');
        translatedContentChinese.classList.remove('active-content');
        translatedContentSpanish.classList.remove('active-content');
       
        if (language === 'original') {
            explanationContent.classList.add('active-content');
        } else if (language === 'chinese') {
            translatedContentChinese.classList.add('active-content');
        } else if (language === 'spanish') {
            translatedContentSpanish.classList.add('active-content');
        }
    }
   
    // Function to handle translation
    async function translateExplanation(targetLanguage) {
        // Check if there's text to translate
        if (!explanationText) {
            alert('No explanation content to translate');
            return;
        }
       
        // Show loading indicator
        translationLoading.classList.remove('hidden');
       
        try {
            // Send translation request
            const response = await fetch('/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: explanationText,
                    language: targetLanguage
                })
            });
           
            // Process response
            const result = await response.json();
           
            if (result.success) {
                // Display translated content based on language
                if (targetLanguage === 'Chinese') {
                    translatedContentChinese.textContent = result.translated_text;
                    isChineseTranslated = true;
                    setActiveLanguageTab('chinese');
                } else if (targetLanguage === 'Spanish') {
                    translatedContentSpanish.textContent = result.translated_text;
                    isSpanishTranslated = true;
                    setActiveLanguageTab('spanish');
                }
            } else {
                alert('Translation failed: ' + result.message);
                setActiveLanguageTab('original');
            }
        } catch (error) {
            alert('Translation Request Failed: ' + error.message);
            setActiveLanguageTab('original');
        } finally {
            // Hide loading indicator
            translationLoading.classList.add('hidden');
        }
    }
   
    // Display references
    function displayReferences(references) {
        const referencesContent = document.getElementById('references-content');
        referencesContent.innerHTML = '';
      
        references.forEach(ref => {
            const refItem = document.createElement('div');
            refItem.className = 'reference-item';
            refItem.innerHTML = `
                <div class="reference-title">${ref.title}</div>
                <div class="reference-content">${ref.content}</div>
            `;
            referencesContent.appendChild(refItem);
        });
      
        document.querySelector('.references-section').classList.remove('hidden');
    }
  
    // Hide references
    function hideReferences() {
        document.querySelector('.references-section').classList.add('hidden');
    }
 });