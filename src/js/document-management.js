const DocumentManagement = {
    // ...existing code...
    
    init: async function() {
        try {
            // Make sure AuthApp is loaded
            if (typeof AuthApp === 'undefined') {
                throw new Error('AuthApp is not loaded. Make sure auth.js is included before document-management.js');
            }

            // Initialize AuthApp if needed
            if (!AuthApp.web3) {
                await AuthApp.init();
            }

            // Check admin access
            if (!await this.checkAdminAccess()) {
                window.location.href = "../login.html";
                return;
            }

            await this.initContract();
            await this.loadCourses();
            await this.loadDocuments();
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Error initializing DocumentManagement:', error);
            this.showStatus('error', 'Initialization error: ' + error.message);
        }
    },

    loadDocuments: async function() {
        console.log("Starting document loading process...");
        try {
            // Get document count
            console.log("Fetching document count from blockchain...");
            const count = await this.contracts.courseDocument.methods.getDocumentCount().call();
            console.log("Document count:", count);

            const documents = [];
            const docIds = await this.contracts.courseDocument.methods.getAllDocumentIds().call();
            console.log("Received document IDs:", docIds);

            for (let i = 0; i < docIds.length; i++) {
                const docId = docIds[i];
                console.log(`Fetching details for document ID ${docId} (${i + 1}/${docIds.length})...`);
                
                try {
                    const docDetails = await this.contracts.courseDocument.methods.getDocument(docId).call();
                    
                    // Convert BigInt timestamps to regular numbers
                    const document = {
                        ...docDetails,
                        timestamp: Number(docDetails.timestamp),
                        accessCount: Number(docDetails.accessCount)
                    };
                    
                    documents.push({
                        id: docId,
                        ...document
                    });
                } catch (docError) {
                    console.error(`Error processing document ${docId}:`, docError);
                }
            }

            console.log(`Successfully processed ${documents.length} documents out of ${docIds.length} IDs`);
            this.displayDocuments(documents);
            
        } catch (error) {
            console.error("Error loading documents:", error);
            this.showStatus('error', 'Error loading documents: ' + error.message);
        }
    }

    // ...existing code...
};

// Initialize on page load
window.addEventListener('load', function() {
    DocumentManagement.init();
});
